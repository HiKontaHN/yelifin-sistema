// components/sales/pos/supplies-used-modal.tsx
"use client";

import { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FlaskConical, Plus, Minus, X, Search } from "lucide-react";
import { useSupplies } from "@/hooks/swr/use-supplies";

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

  const isSelected = (id: number) => selected.some((s) => s.supply_id === id);

  const toggle = (supply: any) => {
    if (isSelected(supply.id)) {
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
        s.supply_id === id ? { ...s, quantity: Math.max(0.01, s.quantity + delta) } : s
      )
    );
  };

  const setQty = (id: number, value: number) => {
    setSelected((prev) =>
      prev.map((s) => s.supply_id === id ? { ...s, quantity: Math.max(0.01, value) } : s)
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
      icon={FlaskConical}
      width="md"
      bodyClassName="flex flex-col gap-3 min-h-0"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button onClick={handleConfirm} className="flex-1">
            Confirmar ({selected.length} suministros)
          </Button>
        </>
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
          <ScrollArea className="flex-1 min-h-0 max-h-52">
            <div className="space-y-1.5 pr-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay suministros disponibles
                </p>
              ) : (
                filtered.map((supply) => {
                  const sel = isSelected(supply.id);
                  return (
                    <div
                      key={supply.id}
                      onClick={() => toggle(supply)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        sel
                          ? "border-primary/50 bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        sel ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {sel && <div className="size-2 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{supply.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {supply.stock} {supply.unit ?? "uds"} · {formatCurrency(Number(supply.unit_cost))}/{supply.unit ?? "ud"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Seleccionados con cantidad */}
          {selected.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cantidades usadas
              </p>
              <ScrollArea className="max-h-40">
                <div className="space-y-1.5 pr-2">
                  {selected.map((s) => (
                    <div key={s.supply_id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                      <p className="text-xs font-medium flex-1 truncate">{s.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="size-5"
                          onClick={(e) => { e.stopPropagation(); updateQty(s.supply_id, -0.5); }}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <Input
                          type="number"
                          value={s.quantity}
                          onChange={(e) => setQty(s.supply_id, Number(e.target.value))}
                          className="h-6 w-14 text-xs text-center px-1"
                          min="0.01"
                          step="0.5"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[10px] text-muted-foreground w-6 truncate">
                          {s.unit ?? "ud"}
                        </span>
                        <Button
                          variant="ghost" size="icon" className="size-5"
                          onClick={(e) => { e.stopPropagation(); updateQty(s.supply_id, 0.5); }}
                        >
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="size-5 text-destructive"
                          onClick={(e) => { e.stopPropagation(); toggle({ id: s.supply_id }); }}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Total costo suministros */}
              <div className="flex justify-between items-center pt-1 border-t">
                <span className="text-xs text-muted-foreground">Costo suministros</span>
                <Badge variant="outline" className="font-bold text-destructive border-destructive/30">
                  -{formatCurrency(totalCost)}
                </Badge>
              </div>
            </div>
          )}

    </ResponsiveModal>
  );
}