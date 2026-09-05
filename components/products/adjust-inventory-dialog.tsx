// components/products/adjust-inventory-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Layers, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouses } from "@/hooks/swr/use-warehouses";
import { Product, ProductVariant } from "@/types";

type AdjustType = "in" | "out";

type Props = {
  product:      Product | null;
  variant?:     ProductVariant | null; // si se pasa, el ajuste es solo para esta variante
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function AdjustInventoryDialog({ product, variant, open, onOpenChange, onSuccess }: Props) {
  const { firebaseUser } = useAuth();
  const { activeWarehouses, defaultWarehouse } = useWarehouses();

  const [type,        setType]        = useState<AdjustType>("in");
  const [quantity,    setQuantity]    = useState<string>("1");
  const [notes,       setNotes]       = useState("");
  const [isLoading,   setIsLoading]   = useState(false);
  const [unitCost,    setUnitCost]    = useState<string>("0");
  const [warehouseId, setWarehouseId] = useState<number | null>(null);

  useEffect(() => {
    if (open) setWarehouseId(defaultWarehouse?.id ?? null);
  }, [open, defaultWarehouse]);

  const handleClose = () => {
    setType("in");
    setQuantity("1");
    setNotes("");
    setUnitCost("0");
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const qty = Number(quantity);
    if (!qty || qty < 1)  { toast.error("La cantidad debe ser al menos 1"); return; }
    if (!notes.trim())    { toast.error("El motivo del ajuste es requerido"); return; }

    try {
      setIsLoading(true);
      const token = await firebaseUser?.getIdToken();
      const res = await fetch("/api/inventory/adjust", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: product!.id,
          variant_id: variant?.id ?? undefined,
          type,
          quantity:   qty,
          notes:      notes.trim(),
          unit_cost:  type === "in" ? unitCost : 0,
          ...(warehouseId ? { warehouse_id: warehouseId } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al registrar el ajuste");
      }

      toast.success(type === "in"
        ? `+${qty} unidades agregadas al inventario`
        : `-${qty} unidades removidas del inventario`
      );
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al registrar el ajuste");
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  const targetName = variant ? variant.variant_name : product.name;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      width="wide"
      as="form"
      formProps={{ id: "adjust-inventory-form", onSubmit: handleSubmit }}
      bodyClassName="space-y-5"
      title="Ajuste de inventario"
      subtitle={
        <>
          <span className="block text-sm text-foreground truncate max-w-65">{product.name}</span>
          {variant && (
            <span className="flex items-center gap-1 mt-0.5">
              <Layers className="size-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{variant.variant_name}</span>
            </span>
          )}
        </>
      }
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="adjust-inventory-form"
            disabled={isLoading}
            className={cn(
              "flex-1 h-11 gap-2",
              type === "out" && "bg-destructive hover:bg-destructive/90",
            )}
          >
            {isLoading
              ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
              : type === "in"
                ? <><TrendingUp  className="size-4" />Agregar unidades</>
                : <><TrendingDown className="size-4" />Remover unidades</>
            }
          </Button>
        </>
      }
    >
            {/* Tipo de ajuste */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tipo de ajuste</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType("in")}
                  disabled={isLoading}
                  className={cn(
                    "h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-colors",
                    type === "in"
                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <TrendingUp className="size-5" />
                  <span className="text-xs font-medium">Agregar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType("out")}
                  disabled={isLoading}
                  className={cn(
                    "h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-colors",
                    type === "out"
                      ? "border-destructive bg-destructive/5 text-destructive"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <TrendingDown className="size-5" />
                  <span className="text-xs font-medium">Remover</span>
                </button>
              </div>
            </div>

            {/* Bodega — solo si hay más de una activa */}
            {activeWarehouses.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <WarehouseIcon className="size-3.5 text-muted-foreground" />
                  Bodega
                </Label>
                <Select
                  value={warehouseId ? String(warehouseId) : ""}
                  onValueChange={(val) => setWarehouseId(Number(val))}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Selecciona una bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cantidad */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Cantidad <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === "" ? "" : e.target.value)}
                className="h-11 text-base"
                disabled={isLoading}
              />
            </div>

            {type === "in" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Costo unitario <span className="text-destructive text-xs">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value === "" ? "" : e.target.value)}
                  className="h-11 text-base"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Motivo — requerido */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Motivo <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                placeholder={type === "in"
                  ? "Ej: Corrección de conteo, devolución de cliente..."
                  : "Ej: Producto dañado, merma, corrección de conteo..."
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-11 text-base"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Este ajuste no genera ningún movimiento financiero, solo afecta el inventario{variant ? ` de ${targetName}` : ""}. <br/>
                {type === "in"
                  && "Al agregar el costo unitario recalculará el costo promedio y el valor del inventario."
                }
              </p>
            </div>

    </ResponsiveModal>
  );
}
