// components/products/inventory-section/pending-form.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrency } from "@/hooks/swr/use-currency";

// ── Tipos ──────────────────────────────────────────────────────────────
export type PendingFormValue = {
  quantity:     number | string;
  unit_cost:    number;
  purchased_at: string;
  notes:        string;
};

export const defaultPendingForm = (): PendingFormValue => ({
  quantity:     "1",
  unit_cost:    0,
  purchased_at: "",
  notes:        "",
});

type Props = {
  value:    PendingFormValue;
  onChange: (value: PendingFormValue) => void;
  disabled?: boolean;
};

// ── Componente ─────────────────────────────────────────────────────────
// Igual de simple que "Ya lo tengo" (sin cuenta, sin moneda/tasa de
// cambio) pero el stock NO queda disponible de inmediato — el producto
// aparece en Compras pendientes hasta que se confirme su llegada.
export function PendingForm({ value, onChange, disabled }: Props) {
  const { symbol } = useCurrency();

  const set = (patch: Partial<PendingFormValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">

      {/* Aviso */}
      <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 leading-relaxed">
        Ya lo compraste pero todavía no llega. Aparecerá en "Compras pendientes"
        hasta que confirmes su llegada — no se generará ningún movimiento
        financiero ni se descontará de ninguna cuenta.
      </p>

      {/* Cantidad */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Cantidad <span className="text-destructive text-xs">*</span>
        </Label>
        <Input
          type="number"
          min="1"
          value={value.quantity}
          onChange={(e) => set({ quantity: e.target.value === "" ? "" : Number(e.target.value) })}
          className="h-11 text-base"
          disabled={disabled}
        />
      </div>

      {/* Costo unitario — opcional */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Costo unitario ({symbol})
          <span className="text-xs text-muted-foreground font-normal ml-1">opcional · para calcular márgenes</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
            {symbol}
          </span>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={value.unit_cost || ""}
            onChange={(e) => set({ unit_cost: Number(e.target.value) || 0 })}
            className="h-11 pl-8 text-base"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Fecha — opcional */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Fecha de compra
          <span className="text-xs text-muted-foreground font-normal ml-1">opcional</span>
        </Label>
        <Input
          type="date"
          value={value.purchased_at}
          onChange={(e) => set({ purchased_at: e.target.value })}
          className="h-11 text-base"
          disabled={disabled}
        />
      </div>

      {/* Notas — opcional */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Notas
          <span className="text-xs text-muted-foreground font-normal ml-1">opcional</span>
        </Label>
        <Input
          placeholder="Ej: Pedido a proveedor, en camino..."
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className="h-11 text-base"
          disabled={disabled}
        />
      </div>

    </div>
  );
}
