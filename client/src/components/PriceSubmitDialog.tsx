import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StationWithPrices } from "@shared/schema";
import { fuelTypes } from "@shared/schema";

const schema = z.object({
  fuelType: z.enum(fuelTypes),
  pricePerLiter: z.coerce.number().positive().max(10),
});

type FormData = z.infer<typeof schema>;

const FUEL_LABELS: Record<string, string> = {
  benzina: "Benzina",
  gasolio: "Gasolio",
  gpl: "GPL",
  elettrico: "Elettrico (€/kWh)",
};

export default function PriceSubmitDialog({
  station,
  children,
}: {
  station: StationWithPrices;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fuelType: "benzina", pricePerLiter: 0 },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      apiRequest("POST", `/api/stations/${station.id}/price`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stations", station.id] });
      toast({ title: "Prezzo segnalato!", description: "Grazie per il tuo contributo." });
      setOpen(false);
      form.reset();
    },
    onError: (e: Error) =>
      toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Segnala Prezzo</DialogTitle>
          <p className="text-sm text-muted-foreground">{station.name}</p>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="fuelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo carburante</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-fuel-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fuelTypes.map((ft) => (
                        <SelectItem key={ft} value={ft}>
                          {FUEL_LABELS[ft]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pricePerLiter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prezzo (€/litro)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.1"
                      max="10"
                      {...field}
                      data-testid="input-price"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="button-submit-price"
            >
              {mutation.isPending ? "Invio..." : "Invia Prezzo"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
