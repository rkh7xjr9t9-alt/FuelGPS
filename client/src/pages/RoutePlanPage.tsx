import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fuelTypes } from "@shared/schema";
import type { RoutePlanResult, StationWithPrices } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  Navigation, MapPin, Fuel, TrendingDown, Clock, AlertCircle, CheckCircle2,
  RotateCcw, Minus, Plus, Car, Bike, Truck
} from "lucide-react";

const VEHICLE_TYPES = [
  { value: "motorcycle", label: "Moto", icon: "🏍️", consumption: "4L/100km" },
  { value: "car", label: "Auto", icon: "🚗", consumption: "7L/100km" },
  { value: "van", label: "Furgone", icon: "🚐", consumption: "11L/100km" },
  { value: "truck", label: "Camion", icon: "🚛", consumption: "28L/100km" },
  { value: "bus", label: "Autobus", icon: "🚌", consumption: "35L/100km" },
];

const FUEL_LABELS: Record<string, string> = { benzina: "Benzina", gasolio: "Gasolio", gpl: "GPL", elettrico: "Elettrico" };

const schema = z.object({
  origin: z.string().min(2, "Inserisci la partenza"),
  destination: z.string().min(2, "Inserisci la destinazione"),
  vehicleType: z.enum(["motorcycle", "car", "van", "truck", "bus"]),
  fuelType: z.enum(fuelTypes),
  tankSizeLiters: z.coerce.number().positive().max(1000),
  currentFuelPercent: z.coerce.number().min(0).max(100),
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
    },
  });

  const fuelPercent = form.watch("currentFuelPercent");
  const tankSize = form.watch("tankSizeLiters");
  const currentLiters = ((fuelPercent / 100) * tankSize).toFixed(1);

  const mutation = useMutation({
    mutationFn: (data: FormData) => apiRequest<RoutePlanResult>("POST", "/api/route/plan", data),
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
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(mapContainerRef.current!, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Draw route
      const routeLayer = L.geoJSON(result.route.geometry, {
        style: { color: "#3b82f6", weight: 5, opacity: 0.8 },
      }).addTo(map);

      // Stop markers
      const visibleStops = result.stops.filter((s) => !removedStops.has(s.station.id));
      visibleStops.forEach((stop, i) => {
        const icon = L.divIcon({
          html: `<div style="background:#f97316;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)">${i + 1}</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([stop.station.lat, stop.station.lon], { icon })
          .bindPopup(`<b>${stop.station.name}</b><br/>€ ${stop.estimatedCost.toFixed(2)}`)
          .addTo(map);
      });

      map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
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

  const visibleStops = result?.stops.filter((s) => !removedStops.has(s.station.id)) ?? [];
  const recalcCost = visibleStops.reduce((acc, s) => acc + s.estimatedCost, 0);

  const formatDist = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m.toFixed(0)} m`;
  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row">
      {/* Form panel */}
      <div className="w-full lg:w-96 flex-shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-border bg-card">
        <div className="p-4 space-y-5">
          <div>
            <h1 className="text-xl font-bold">Pianifica Percorso</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Trova le migliori fermate per il rifornimento</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="origin" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1"><MapPin size={13} /> Partenza</FormLabel>
                  <FormControl><Input {...field} placeholder="es. Milano" data-testid="input-origin" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="destination" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1"><Navigation size={13} /> Destinazione</FormLabel>
                  <FormControl><Input {...field} placeholder="es. Roma" data-testid="input-destination" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Vehicle type */}
              <FormField control={form.control} name="vehicleType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Veicolo</FormLabel>
                  <div className="grid grid-cols-5 gap-1">
                    {VEHICLE_TYPES.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => field.onChange(v.value)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-colors text-xs ${
                          field.value === v.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40"
                        }`}
                        data-testid={`vehicle-${v.value}`}
                      >
                        <span className="text-base">{v.icon}</span>
                        <span className="font-medium">{v.label}</span>
                        <span className="text-muted-foreground text-[10px] leading-tight">{v.consumption}</span>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="fuelType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1"><Fuel size={13} /> Carburante</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-route-fuel"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fuelTypes.map((ft) => <SelectItem key={ft} value={ft}>{FUEL_LABELS[ft]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="tankSizeLiters" render={({ field }) => (
                <FormItem>
                  <FormLabel>Dimensione serbatoio (L)</FormLabel>
                  <FormControl><Input type="number" min={5} max={1000} {...field} data-testid="input-tank-size" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="currentFuelPercent" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Carburante attuale — {fuelPercent}% ({currentLiters}L)
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
              )} />

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
                  <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
                </Alert>
              )}
            </form>
          </Form>
        </div>
      </div>

      {/* Results panel */}
      <div className="flex-1 flex flex-col">
        {result ? (
          <>
            {/* Map */}
            <div ref={mapContainerRef} className="w-full" style={{ height: "40vh", minHeight: 220 }} />

            {/* Summary cards */}
            <div className="p-4 border-b border-border">
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-border/60">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Distanza</p>
                    <p className="font-bold" data-testid="text-total-distance">{formatDist(result.route.distance)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Tempo</p>
                    <p className="font-bold">{formatDuration(result.route.duration)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Costo stimato</p>
                    <p className="font-bold text-primary" data-testid="text-estimated-cost">
                      € {recalcCost.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Stops list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Fuel size={15} className="text-primary" />
                Fermate consigliate ({visibleStops.length}/{result.stops.length})
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 text-xs"
                  onClick={() => setRemovedStops(new Set())}
                  data-testid="button-reset-stops"
                >
                  <RotateCcw size={11} className="mr-1" /> Ripristina
                </Button>
              </h2>

              {result.stops.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                  <p className="font-medium">Nessuna fermata necessaria!</p>
                  <p className="text-sm mt-1">Il tuo carburante è sufficiente per l'intero percorso.</p>
                </div>
              )}

              {result.stops.map((stop, i) => {
                const removed = removedStops.has(stop.station.id);
                return (
                  <Card
                    key={stop.station.id}
                    className={`border-border/60 transition-opacity ${removed ? "opacity-40" : ""}`}
                    data-testid={`stop-card-${i}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm leading-tight">{stop.station.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {stop.station.city} · {(stop.distanceFromRoute * 1000).toFixed(0)}m dal percorso
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-sm font-bold text-primary">
                                € {stop.estimatedCost.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {stop.fillLiters.toFixed(0)}L
                              </span>
                              {stop.station.brand && (
                                <Badge variant="outline" className="text-xs">{stop.station.brand}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() => toggleStop(stop.station.id)}
                          data-testid={`button-toggle-stop-${i}`}
                        >
                          {removed ? <Plus size={14} /> : <Minus size={14} />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <Navigation size={48} className="text-muted-foreground/40 mx-auto mb-4" />
              <h2 className="font-semibold text-lg mb-2">Pianifica il tuo viaggio</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Inserisci partenza e destinazione per trovare le stazioni di rifornimento ottimali lungo il percorso.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
