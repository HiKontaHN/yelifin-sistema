// components/products/inventory-section/purchase-form.tsx
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, CreditCard, Wallet, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCreditCards } from "@/hooks/swr/use-credit-cards";
import { DEFAULT_TIMEZONE, formatCalendarDate, todayInTimeZone } from "@/lib/date-utils";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useSuggestedExchangeRate } from "@/hooks/swr/use-exchange-rate";

const TASA_DEFAULT = 27;

const CURRENCY_NAMES: Record<string, string> = {
  HNL: "Lempiras",
  USD: "Dólares",
  MXN: "Pesos mexicanos",
  GTQ: "Quetzales",
  CRC: "Colones",
  EUR: "Euros",
};

export type PurchaseFormValue = {
  payment_mode:  "account" | "credit_card";
  account_id:    number | null;
  credit_card_id: number | null;
  currency:      "USD" | "HNL";
  exchange_rate: number;
  quantity:      number | string;
  unit_cost:     number;
  shipping:      number;
  purchased_at:  string;
  notes:         string;
  is_pending?:   boolean;
};

export const defaultPurchaseForm = (timezone = DEFAULT_TIMEZONE): PurchaseFormValue => ({
  payment_mode:  "account",
  account_id:    null,
  credit_card_id: null,
  currency:      "USD",
  exchange_rate: TASA_DEFAULT,
  quantity:      "1",
  unit_cost:     0,
  shipping:      0,
  purchased_at:  todayInTimeZone(timezone),
  notes:         "",
  is_pending:    false,
});

type Props = {
  value:     PurchaseFormValue;
  onChange:  (value: PurchaseFormValue) => void;
  disabled?: boolean;
};

type CostMode = "unit" | "total";

export function PurchaseForm({ value, onChange, disabled }: Props) {
  const { accounts }       = useAccounts();
  const { creditCards }    = useCreditCards();
  const { format, symbol, currency: businessCurrency } = useCurrency();
  const [costMode, setCostMode] = useState<CostMode>("total");
  const [paymentMode, setPaymentMode] = useState<PurchaseFormValue["payment_mode"]>(value.payment_mode);
  const { rate: suggestedRate, rateDate: suggestedRateDate } = useSuggestedExchangeRate();

  const set = (patch: Partial<PurchaseFormValue>) =>
    onChange({ ...value, ...patch });

  const isCreditCardMode = paymentMode === "credit_card";
  const isPending = value.is_pending ?? false;

  useEffect(() => {
    setPaymentMode(value.payment_mode);
  }, [value.payment_mode]);

  // Precarga la tasa sugerida (BCH) apenas carga — solo si el campo sigue
  // en su valor por defecto, para no pisar algo que el usuario ya escribió.
  useEffect(() => {
    if (suggestedRate && value.exchange_rate === TASA_DEFAULT) {
      set({ exchange_rate: suggestedRate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedRate]);

  // ── Cálculos ────────────────────────────────────────────────────────
  const qty      = Number(value.quantity)      || 0;
  const cost     = Number(value.unit_cost)     || 0;
  const rate     = Number(value.exchange_rate) || TASA_DEFAULT;
  const ship     = Number(value.shipping)      || 0;
  const isUSD    = value.currency === "USD";
  const inputSymbol = isUSD ? "$" : symbol;
  const costHnl  = isUSD ? cost * rate : cost;
  const shipUnit = qty > 0 ? ship / qty : 0;
  const finalUnit = costHnl + shipUnit;
  const totalCost = finalUnit * qty;
  const inputTotal = cost * qty + (isUSD ? ship / rate : ship);
  const inputUnit = qty > 0 ? inputTotal / qty : cost;
  const formatInputAmount = (amount: number) => isUSD
    ? new Intl.NumberFormat("es-HN", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount)
    : format(amount);

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
  const displayTotal = inputTotal;

  return (
    <div className="space-y-4">

      {/* Medio de pago */}
      {creditCards.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border">
          <button
            type="button"
            onClick={() => {
              setPaymentMode("account");
              set({ payment_mode: "account", account_id: null, credit_card_id: null });
            }}
            disabled={disabled}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all duration-200 ${
              !isCreditCardMode
                ? "rounded-xl bg-primary/15 text-primary"
                : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary"
            }`}
          >
            <Wallet className="size-3" /> Cuenta
          </button>
          <button
            type="button"
            onClick={() => {
              setPaymentMode("credit_card");
              set({ payment_mode: "credit_card", account_id: null, credit_card_id: value.credit_card_id ?? creditCards[0]?.id ?? null });
            }}
            disabled={disabled}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all duration-200 ${
              isCreditCardMode
                ? "rounded-xl bg-primary/15 text-primary"
                : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary"
            }`}
          >
            <CreditCard className="size-3" /> Tarjeta
          </button>
        </div>
      )}

      {/* Cuenta o tarjeta — ancho completo */}
      {!isCreditCardMode ? <div className="space-y-1.5">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Wallet className="size-3.5 text-muted-foreground" />
          Cuenta <span className="text-destructive text-xs">*</span>
        </Label>
        <Select
          value={value.account_id?.toString() ?? ""}
          onValueChange={(v) => {
            setPaymentMode("account");
            set({ payment_mode: "account", account_id: Number(v), credit_card_id: null });
          }}
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
      </div> : (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <CreditCard className="size-3.5 text-muted-foreground" />
            Tarjeta de crédito <span className="text-destructive text-xs">*</span>
          </Label>
          <Select
            value={value.credit_card_id?.toString() ?? ""}
            onValueChange={(v) => {
              setPaymentMode("credit_card");
              set({ payment_mode: "credit_card", account_id: null, credit_card_id: Number(v) });
            }}
            disabled={disabled}
          >
            <SelectTrigger className="h-11 min-h-11 w-full">
              <SelectValue placeholder="Selecciona una tarjeta" />
            </SelectTrigger>
            <SelectContent className="w-full">
              {creditCards.map((card) => (
                <SelectItem key={card.id} value={String(card.id)}>
                  {card.name}{card.last_four ? ` ···· ${card.last_four}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
            <SelectTrigger className="h-11 min-h-11 w-full">
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
              className="h-11 min-h-11 text-base"
              disabled={disabled}
            />
            {suggestedRate != null && (
              <p className="text-xs text-muted-foreground">
                Sugerido (BCH{suggestedRateDate ? `, ${formatCalendarDate(suggestedRateDate, { day: "numeric", month: "short" })}` : ""}): {suggestedRate}
                {value.exchange_rate !== suggestedRate && (
                  <button
                    type="button"
                    className="ml-1.5 text-primary hover:underline font-medium"
                    onClick={() => set({ exchange_rate: suggestedRate })}
                  >
                    Usar
                  </button>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Toggle unitario / total */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Costo ({inputSymbol}) <span className="text-destructive text-xs">*</span>
          </Label>
          <Tabs value={costMode} onValueChange={(mode) => setCostMode(mode as CostMode)}>
            <TabsList className="max-w-full gap-1.5 overflow-x-auto rounded-xl border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="unit" disabled={disabled} className="rounded-xl border-0 px-2 py-1.5 text-xs font-medium transition-all duration-200 hover:bg-primary/15 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:font-medium data-[state=active]:text-primary">Por unidad</TabsTrigger>
              <TabsTrigger value="total" disabled={disabled} className="rounded-xl border-0 px-2 py-1.5 text-xs font-medium transition-all duration-200 hover:bg-primary/15 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:font-medium data-[state=active]:text-primary">Total</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
            {inputSymbol}
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
              ? <>Total ({qty} uds): <span className="font-medium text-foreground">{formatInputAmount(inputTotal)}</span></>
              : <>Por unidad: <span className="font-medium text-foreground">{formatInputAmount(inputUnit)}</span></>
            }
          </p>
        )}
      </div>

      {/* Toggle pendiente */}
      <div className="flex items-start justify-between gap-3 rounded-xl border p-3.5">
        <div className="space-y-0.5 min-w-0">
          <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Clock className="size-3.5 text-amber-500 shrink-0" />
            Stock pendiente de llegada
          </Label>
          <p className="text-xs text-muted-foreground">
            {isPending
              ? "El stock se acredita al confirmar la llegada. El dinero se debita ahora."
              : "El stock entra al inventario de inmediato al guardar."}
          </p>
        </div>
        <Switch
          checked={isPending}
          onCheckedChange={(checked) => set({ is_pending: checked, ...(checked ? { shipping: 0 } : {}) })}
          disabled={disabled}
          className="shrink-0 mt-0.5"
        />
      </div>

      {isPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 px-3.5 py-3 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          El costo de envío se podrá registrar al confirmar la llegada, una vez sepas cuánto costó.
        </div>
      )}

      {/* Envío — oculto en modo pendiente */}
      {!isPending && <div className="space-y-1.5">
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
      </div>}

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
