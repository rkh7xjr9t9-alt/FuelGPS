import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { fuelTypes, vehicleTypes, FUEL_DISPLAY, DEFAULT_CONSUMPTION } from "@shared/schema";
import type { VehicleProfile, VehicleType, FuelType } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Car,
  Truck,
  Fuel,
  Gauge,
  Ruler,
  Weight,
  Star,
  Settings,
  LogIn,
} from "lucide-react";

const VEHICLE_CONFIG: Record<
  string,
  { label: string; icon: string }
> = {
  motorcycle: { label: "Moto", icon: "🏍️" },
  car: { label: "Auto", icon: "🚗" },
  van: { label: "Furgone", icon: "🚐" },
  truck: { label: "Camion", icon: "🚛" },
  bus: { label: "Autobus", icon: "🚌" },
  ev: { label: "Elettrico", icon: "⚡" },
};

function VehicleCard({
  profile,
  onDelete,
}: {
  profile: VehicleProfile;
  onDelete: () => void;
}) {
  const config = VEHICLE_CONFIG[profile.type] || VEHICLE_CONFIG.car;

  return (
    <Card className="border-border/60" data-testid={`vehicle-card-${profile.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl">{config.icon}</div>
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                {profile.name}
                {profile.isDefault && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 gap-0.5">
                    <Star size={8} /> Default
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.label}
                {profile.fuelType ? ` · ${FUEL_DISPLAY[profile.fuelType as FuelType]?.label || profile.fuelType}` : ""}
              </p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                {profile.tankCapacityL && (
                  <span className="flex items-center gap-1">
                    <Fuel size={10} /> {profile.tankCapacityL}L
                  </span>
                )}
                {profile.consumptionLper100km && (
                  <span className="flex items-center gap-1">
                    <Gauge size={10} /> {profile.consumptionLper100km}L/100km
                  </span>
                )}
                {profile.heightM && (
                  <span className="flex items-center gap-1">
                    <Ruler size={10} /> {profile.heightM}m
                  </span>
                )}
                {profile.weightKg && (
                  <span className="flex items-center gap-1">
                    <Weight size={10} /> {profile.weightKg}kg
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            data-testid={`delete-vehicle-${profile.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateVehicleDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<VehicleType>("car");
  const [fuelType, setFuelType] = useState<FuelType>("benzina");
  const [tankCapacity, setTankCapacity] = useState("50");
  const [consumption, setConsumption] = useState("7");
  const [heightM, setHeightM] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vehicles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setOpen(false);
      setName("");
      toast({ title: "Profilo veicolo creato" });
      onSuccess();
    },
    onError: (e: Error) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });

  const handleTypeChange = (v: VehicleType) => {
    setType(v);
    setConsumption(String(DEFAULT_CONSUMPTION[v]));
    if (v === "ev") setFuelType("elettrico");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-add-vehicle">
          <Plus size={15} />
          Nuovo profilo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo profilo veicolo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. La mia Panda"
              data-testid="input-vehicle-name"
            />
          </div>

          <div>
            <Label className="text-xs">Tipo veicolo</Label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {Object.entries(VEHICLE_CONFIG).map(([value, config]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTypeChange(value as VehicleType)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs transition-all ${
                    type === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="text-lg">{config.icon}</span>
                  <span className="font-medium">{config.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Carburante</Label>
            <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fuelTypes.map((ft) => (
                  <SelectItem key={ft} value={ft}>
                    {FUEL_DISPLAY[ft].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Serbatoio (L)</Label>
              <Input
                type="number"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Consumo (L/100km)</Label>
              <Input
                type="number"
                value={consumption}
                onChange={(e) => setConsumption(e.target.value)}
              />
            </div>
          </div>

          {(type === "van" || type === "truck" || type === "bus") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Altezza (m)</Label>
                <Input
                  type="number"
                  value={heightM}
                  onChange={(e) => setHeightM(e.target.value)}
                  placeholder="es. 2.8"
                />
              </div>
              <div>
                <Label className="text-xs">Peso (kg)</Label>
                <Input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="es. 3200"
                />
              </div>
            </div>
          )}

          <Button
            className="w-full"
            disabled={!name || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                name,
                type,
                fuelType,
                tankCapacityL: parseFloat(tankCapacity) || undefined,
                consumptionLper100km: parseFloat(consumption) || undefined,
                heightM: heightM ? parseFloat(heightM) : undefined,
                weightKg: weightKg ? parseFloat(weightKg) : undefined,
              })
            }
            data-testid="button-save-vehicle"
          >
            {createMutation.isPending ? "Salvataggio..." : "Salva profilo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ profiles: VehicleProfile[] }>({
    queryKey: ["/api/vehicles"],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vehicles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Profilo eliminato" });
    },
  });

  const profiles = data?.profiles ?? [];

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Settings size={28} className="text-primary" />
          </div>
          <h2 className="font-semibold text-sm mb-1">Profili veicolo</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Accedi per salvare i tuoi veicoli e usarli nel pianificatore percorsi.
          </p>
          <Button
            onClick={() => (window.location.hash = "/auth")}
            className="gap-2"
          >
            <LogIn size={14} />
            Accedi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">I miei veicoli</h1>
            <p className="text-sm text-muted-foreground">
              Gestisci i profili veicolo per la pianificazione percorsi
            </p>
          </div>
          <CreateVehicleDialog
            onSuccess={() =>
              queryClient.invalidateQueries({
                queryKey: ["/api/vehicles"],
              })
            }
          />
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Card key={i} className="border-border/60 animate-pulse">
                <CardContent className="p-4 h-20" />
              </Card>
            ))}
          </div>
        )}

        {!isLoading && profiles.length === 0 && (
          <Card className="border-dashed border-2 border-border/60">
            <CardContent className="p-8 text-center">
              <Car size={32} className="mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Nessun veicolo salvato</p>
              <p className="text-xs text-muted-foreground mt-1">
                Aggiungi il tuo primo veicolo per personalizzare i percorsi.
              </p>
            </CardContent>
          </Card>
        )}

        {profiles.map((profile) => (
          <VehicleCard
            key={profile.id}
            profile={profile}
            onDelete={() => deleteMutation.mutate(profile.id)}
          />
        ))}

        {/* Credits section */}
        <Card className="border-border/60 mt-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
              Fonti dati
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>MIMIT — Ministero delle Imprese e del Made in Italy (IODL 2.0)</p>
            <p>OpenStreetMap contributors (ODbL 1.0)</p>
            <p>OSRM — Open Source Routing Machine (BSD 2-Clause)</p>
            <p>CartoDB/CARTO tiles (CC BY 3.0)</p>
            <p>Nominatim geocoding (ODbL 1.0)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
