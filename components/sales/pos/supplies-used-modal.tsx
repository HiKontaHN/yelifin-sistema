// components/sales/pos/supplies-used-modal.tsx
"use client";

import { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingBag, Plus, Minus, X, Search } from "lucide-react";
import { useSupplies } from "@/hooks/swr/use-supplies";
import { cn } from "@/lib/utils";

export type SupplyUsed = {
  supply_id: number;
  name: string;
  unit: string | null;
  quantity: number;
  unit_cost: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (supplies: SupplyUsed[]) => void;
  initialSupplies?: SupplyUsed[];
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", minimumFractionDigits: 0 }).format(v);

export function SuppliesUsedModal({ open, onOpenChange, onConfirm, initialSupplies = [] }: Props) {
  const { supplies } = useSupplies();
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<SupplyUsed[]>(initialSupplies);

  useEffect(() => {
    if (open) setSelected(initialSupplies);
  }, [open]);

  const filtered = supplies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const getSelected = (id: number) => selected.find((s) => s.supply_id === id);

  const toggle = (supply: any) => {
    if (getSelected(supply.id)) {
      setSelected((prev) => prev.filter((s) => s.supply_id !== supply.id));
    } else {
      setSelected((prev) => [
        ...prev,
        {
          supply_id: supply.id,
          name:      supply.name,
          unit:      supply.unit,
          quantity:  1,
          unit_cost: Number(supply.unit_cost),
        },
      ]);
    }
  };

  const updateQty = (id: number, delta: number) => {
    setSelected((prev) =>
      prev.map((s) =>
        s.supply_id === id ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s
      )
    );
  };

  const setQty = (id: number, value: number) => {
    setSelected((prev) =>
      prev.map((s) => s.supply_id === id ? { ...s, quantity: Math.max(1, Math.round(value) || 1) } : s)
    );
  };

  const totalCost = selected.reduce((acc, s) => acc + s.quantity * s.unit_cost, 0);

  const handleConfirm = () => {
    onConfirm(selected.filter((s) => s.quantity > 0));
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Suministros usados"
      subtitle="Selecciona los suministros utilizados en esta venta para calcular el costo real"
      icon={ShoppingBag}
      width="md"
      footer={
        <div className="w-full space-y-3">
          {selected.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Costo suministros</span>
              <Badge variant="outline" className="font-bold text-destructive border-destructive/30">
                -{formatCurrency(totalCost)}
              </Badge>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
            <Button onClick={handleConfirm} className="flex-1">
              Confirmar ({selected.length} suministros)
            </Button>
          </div>
        </div>
      }
    >
      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar suministro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Lista de suministros */}
      <ScrollArea className="max-h-80">
        <div className="space-y-1.5 pr-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay suministros disponibles
            </p>
          ) : (
            filtered.map((supply) => {
              const sel = getSelected(supply.id);
              return (
                <div
                  key={supply.id}
                  onClick={() => toggle(supply)}
                  className={cn(
                    "relative rounded-lg border p-2.5 cursor-pointer transition-colors",
                    sel ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  {sel && (
                    <Button
                      variant="ghost" size="icon"
                      className="absolute top-1 right-1 size-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); toggle(supply); }}
                    >
                      <X className="size-4" />
                    </Button>
                  )}

                  <div className={cn("flex items-center gap-2.5", sel && "pr-8")}>
                    <div className={cn(
                      "size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      sel ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}>
                      {sel && <div className="size-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{supply.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Stock: {supply.stock} {supply.unit ?? "uds"} · {formatCurrency(Number(supply.unit_cost))}/{supply.unit ?? "ud"}
                      </p>
                    </div>
                  </div>

                  {/* Cantidad usada — inline en la misma card */}
                  {sel && (
                    <div
                      className="flex items-center justify-between gap-2 mt-2 pl-[30px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs text-muted-foreground">
                        Cantidad ({supply.unit ?? "ud"})
                      </span>
                      <div className="flex items-center gap-0.5 rounded-full border bg-background p-0.5 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="size-7 rounded-full"
                          onClick={(e) => { e.stopPropagation(); updateQty(supply.id, -1); }}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <Input
                          type="number"
                          value={sel.quantity}
                          onChange={(e) => setQty(supply.id, Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 w-10 border-0 text-sm text-center px-0 shadow-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          min="1"
                          step="1"
                        />
                        <Button
                          variant="ghost" size="icon" className="size-7 rounded-full"
                          onClick={(e) => { e.stopPropagation(); updateQty(supply.id, 1); }}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </ResponsiveModal>
  );
}
