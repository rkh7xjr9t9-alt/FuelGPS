import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fuelTypes, FUEL_DISPLAY } from "@shared/schema";
import type { StationWithPrices, FuelType } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";

export default function PriceSubmitDialog({
  station,
  children,
}: {
  station: StationWithPrices;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>("benzina");
  const [price, setPrice] = useState("");
  const [isSelfService, setIsSelfService] = useState(true);
  const { toast } = useToast();

  // Filter to only fuel types available at this station
  const availableFuels = fuelTypes.filter((ft) => {
    if (ft === "benzina") return station.hasBenzina;
    if (ft === "gasolio") return station.hasGasolio;
    if (ft === "gpl") return station.hasGpl;
    if (ft === "metano") return station.hasMetano;
    if (ft === "elettrico") return station.hasElettrico;
    return false;
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prices/report", {
        stationId: station.id,
        fuelType,
        price: parseFloat(price),
        isSelfService,
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      setOpen(false);
      setPrice("");
      toast({
        title: data.flagged
          ? "Prezzo segnalato (in revisione)"
          : "Prezzo registrato",
        description: data.message,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Errore",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Segnala prezzo</DialogTitle>
          <p className="text-sm text-muted-foreground">{station.name}</p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">Tipo carburante</Label>
            <Select
              value={fuelType}
              onValueChange={(v) => setFuelType(v as FuelType)}
            >
              <SelectTrigger data-testid="select-report-fuel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(availableFuels.length > 0 ? availableFuels : fuelTypes).map(
                  (ft) => (
                    <SelectItem key={ft} value={ft}>
                      {FUEL_DISPLAY[ft].label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Prezzo (€/L)</Label>
            <Input
              type="number"
              step="0.001"
              min="0.50"
              max="5.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="es. 1.789"
              className="tabular-nums"
              data-testid="input-report-price"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Self-service</Label>
            <Switch
              checked={isSelfService}
              onCheckedChange={setIsSelfService}
              data-testid="switch-self-service"
            />
          </div>

          <Button
            className="w-full gap-2"
            disabled={
              !price || parseFloat(price) < 0.5 || mutation.isPending
            }
            onClick={() => mutation.mutate()}
            data-testid="button-submit-price"
          >
            <CheckCircle2 size={14} />
            {mutation.isPending ? "Invio..." : "Conferma prezzo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
