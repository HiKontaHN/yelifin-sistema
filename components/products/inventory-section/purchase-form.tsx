// components/products/inventory-section/purchase-form.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calculator, Wallet } from "lucide-react";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { toLocalDateInput } from "@/lib/date-utils";
import { useCurrency } from "@/hooks/swr/use-currency";

const TASA_DEFAULT = 24.89;

const CURRENCY_NAMES: Record<string, string> = {
  HNL: "Lempiras",
  USD: "Dólares",
  MXN: "Pesos mexicanos",
  GTQ: "Quetzales",
  CRC: "Colones",
  EUR: "Euros",
};

export type PurchaseFormValue = {
  account_id:    number | null;
  currency:      "USD" | "HNL";
  exchange_rate: number;
  quantity:      number | string;
  unit_cost:     number;
  shipping:      number;
  purchased_at:  string;
  notes:         string;
};

export const defaultPurchaseForm = (): PurchaseFormValue => ({
  account_id:    null,
  currency:      "USD",
  exchange_rate: TASA_DEFAULT,
  quantity:      "1",
  unit_cost:     0,
  shipping:      0,
  purchased_at:  toLocalDateInput(new Date()),
  notes:         "",
});

type Props = {
  value:     PurchaseFormValue;
  onChange:  (value: PurchaseFormValue) => void;
  disabled?: boolean;
};

type CostMode = "unit" | "total";

export function PurchaseForm({ value, onChange, disabled }: Props) {
  const { accounts }       = useAccounts();
  const { format, symbol, currency: businessCurrency } = useCurrency();
  const [costMode, setCostMode] = useState<CostMode>("total");

  const set = (patch: Partial<PurchaseFormValue>) =>
    onChange({ ...value, ...patch });

  // ── Cálculos ────────────────────────────────────────────────────────
  const qty      = Number(value.quantity)      || 0;
  const cost     = Number(value.unit_cost)     || 0;
  const rate     = Number(value.exchange_rate) || TASA_DEFAULT;
  const ship     = Number(value.shipping)      || 0;
  const isUSD    = value.currency === "USD";
  const costHnl  = isUSD ? cost * rate : cost;
  const shipUnit = qty > 0 ? ship / qty : 0;
  const finalUnit = costHnl + shipUnit;
  const totalCost = finalUnit * qty;

  const showSummary = qty > 0 && cost > 0;

  // Cuando el usuario escribe en "total", derivar unit_cost
  const handleTotalInput = (rawTotal: number) => {
    if (qty <= 0) return;
    const totalHnl    = isUSD ? rawTotal * rate : rawTotal;
    const unitNoShip  = (totalHnl / qty) - shipUnit;
    const unitOriginal = isUSD ? unitNoShip / rate : unitNoShip;
    set({ unit_cost: Math.max(0, unitOriginal) });
  };

  // Valor a mostrar en el input de total (en la moneda seleccionada)
  const displayTotal = isUSD
    ? cost * qty                      // total en USD
    : (costHnl + shipUnit) * qty;     // total en HNL con envío

  return (
    <div className="space-y-4">

      {/* Cuenta — ancho completo */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Wallet className="size-3.5 text-muted-foreground" />
          Cuenta <span className="text-destructive text-xs">*</span>
        </Label>
        <Select
          value={value.account_id?.toString() ?? ""}
          onValueChange={(v) => set({ account_id: Number(v) })}
          disabled={disabled}
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Selecciona una cuenta" />
          </SelectTrigger>
          <SelectContent className="w-full">
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                <div className="flex items-center justify-between gap-8 w-full">
                  <span>{a.name}</span>
                  {a.balance !== null && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(Number(a.balance))}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

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

      {/* Moneda + Tasa */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            Moneda <span className="text-destructive text-xs">*</span>
          </Label>
          <Select
            value={value.currency}
            onValueChange={(v) => set({ currency: v as "USD" | "HNL" })}
            disabled={disabled}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[--radix-select-trigger-width] min-w-0">
              <SelectItem value="USD">USD — Dólares</SelectItem>
              {businessCurrency !== "USD" && (
                <SelectItem value={businessCurrency}>
                  {businessCurrency} — {CURRENCY_NAMES[businessCurrency] ?? businessCurrency}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {isUSD && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Tasa de cambio <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              type="number"
              step="0.01"
              value={value.exchange_rate}
              onChange={(e) => set({ exchange_rate: Number(e.target.value) || TASA_DEFAULT })}
              className="h-11 text-base"
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {/* Toggle unitario / total */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Costo ({symbol}) <span className="text-destructive text-xs">*</span>
          </Label>
          {/* Toggle */}
          <div className="flex items-center gap-3 border-b text-xs">
            {(["unit", "total"] as CostMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => setCostMode(mode)}
                className={`border-b-2 border-transparent px-0.5 pb-1.5 font-medium transition-colors ${
                  costMode === mode
                    ? "border-foreground text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "unit" ? "Por unidad" : "Total"}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
            {symbol}
          </span>
          {costMode === "unit" ? (
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
          ) : (
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={displayTotal || ""}
              onChange={(e) => handleTotalInput(Number(e.target.value) || 0)}
              className="h-11 pl-8 text-base"
              disabled={disabled || qty <= 0}
            />
          )}
        </div>

        {/* Derivado: muestra el valor contrario */}
        {cost > 0 && qty > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {costMode === "unit"
              ? <>Total ({qty} uds): <span className="font-medium text-foreground">{format(cost * qty)}</span></>
              : <>Por unidad: <span className="font-medium text-foreground">{format(cost)}</span></>
            }
          </p>
        )}
      </div>

      {/* Envío */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Gastos de envío ({symbol})
          <span className="text-xs text-muted-foreground font-normal ml-1">
            · se distribuye entre unidades
          </span>
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
            value={value.shipping || ""}
            onChange={(e) => set({ shipping: Number(e.target.value) || 0 })}
            className="h-11 pl-8 text-base"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Resumen */}
      {showSummary && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2">
            <Calculator className="size-3.5" />
            Resumen
          </div>
          {isUSD && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Costo (USD → {symbol})</span>
              <span>{format(cost)} × {rate} = {format(costHnl)}</span>
            </div>
          )}
          {ship > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Envío por unidad</span>
              <span>{format(shipUnit)}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between text-xs font-medium">
            <span>Costo unitario final</span>
            <span>{format(finalUnit)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-primary">
            <span>Total ({qty} uds)</span>
            <span>{format(totalCost)}</span>
          </div>
        </div>
      )}

      <Separator />

      {/* Fecha */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Fecha de compra</Label>
        <Input
          type="date"
          value={value.purchased_at}
          onChange={(e) => set({ purchased_at: e.target.value })}
          className="h-11 text-base"
          disabled={disabled}
        />
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Notas
          <span className="text-xs text-muted-foreground font-normal ml-1">opcional</span>
        </Label>
        <Input
          placeholder="Ej: Lote inicial, compra de apertura..."
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className="h-11 text-base"
          disabled={disabled}
        />
      </div>

    </div>
  );
}