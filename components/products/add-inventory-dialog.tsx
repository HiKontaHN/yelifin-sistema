// components/products/add-inventory-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, PackagePlus, Calculator, Wallet, Plus, Trash2, Clock, CreditCard, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreatePurchase } from "@/hooks/swr/use-purchases";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCreditCards } from "@/hooks/swr/use-credit-cards";
import { useCurrency } from "@/hooks/swr/use-currency";
import { Product } from "@/types";
import { localDateToISO, toLocalDateInput } from "@/lib/date-utils";

const TASA_DEFAULT = 24.89;

const CURRENCY_NAMES: Record<string, string> = {
  HNL: "Lempiras",
  USD: "Dólares",
  MXN: "Pesos mexicanos",
  GTQ: "Quetzales",
  CRC: "Colones",
  EUR: "Euros",
};

// ── Tipos ──────────────────────────────────────────────────────────────

// "base" = producto sin variante, número como string = variant_id
type VariantKey = "base" | string;

type LineItem = {
  key: string; // id interno para React key
  variant_key: VariantKey;
  quantity: string;
  unit_cost: string; // en la moneda seleccionada (USD o HNL)
};

// ── Schema — solo campos de cabecera ──────────────────────────────────

const schema = z.object({
  account_id: z.coerce.number().optional(),
  currency: z.enum(["USD", "HNL"]),
  exchange_rate: z.coerce.number().min(1, "La tasa debe ser mayor a 0"),
  shipping: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  purchased_at: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Props ──────────────────────────────────────────────────────────────

type Props = {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

// ── Componente ─────────────────────────────────────────────────────────

export function AddInventoryDialog({ product, open, onOpenChange, onSuccess }: Props) {
  const { createPurchase, isCreating } = useCreatePurchase();
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();
  const { format, symbol, currency: businessCurrency } = useCurrency();

  const [paymentMode, setPaymentMode] = useState<"account" | "credit_card">("account");
  const [creditCardId, setCreditCardId] = useState<number | null>(null);
  const [shippingAccountId, setShippingAccountId] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [items, setItems] = useState<LineItem[]>([
    { key: uid(), variant_key: "base", quantity: "1", unit_cost: "0" },
  ]);

  const {
    register, handleSubmit, reset, control, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: "USD",
      exchange_rate: TASA_DEFAULT,
      shipping: 0,
    },
  });

  const currency = useWatch({ control, name: "currency" });
  const exchangeRate = useWatch({ control, name: "exchange_rate" });
  const shipping = useWatch({ control, name: "shipping" });

  const rate = Number(exchangeRate) || TASA_DEFAULT;
  const ship = Number(shipping) || 0;
  const isUSD = currency === "USD";

  const totalUnits = items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
  const shippingPerUnit = totalUnits > 0 ? ship / totalUnits : 0;

  const totalCost = items.reduce((acc, i) => {
    const qty = Number(i.quantity) || 0;
    const cost = Number(i.unit_cost) || 0;
    const costHnl = isUSD ? cost * rate : cost;
    return acc + (costHnl + shippingPerUnit) * qty;
  }, 0);

  useEffect(() => {
    if (open) {
      setItems([{ key: uid(), variant_key: "base", quantity: "1", unit_cost: "0" }]);
      setIsPending(false);
      setPaymentMode("account");
      setCreditCardId(null);
      setShippingAccountId(null);
      reset({
        currency: "USD",
        exchange_rate: TASA_DEFAULT,
        shipping: 0,
        purchased_at: toLocalDateInput(new Date()),
      });
    }
  }, [open, reset]);

  // ── Manejo de items ────────────────────────────────────────────────

  const addItem = () =>
    setItems((prev) => [...prev, { key: uid(), variant_key: "base", quantity: "1", unit_cost: "0" }]);

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const updateItem = (key: string, field: keyof Omit<LineItem, "key">, value: string) =>
    setItems((prev) => prev.map((i) => i.key === key ? { ...i, [field]: value } : i));

  // Claves ya usadas por otras filas (para deshabilitar en el selector)
  const usedVariantKeys = (currentKey: string) =>
    items.filter((i) => i.key !== currentKey).map((i) => i.variant_key);

  // ── Submit ──────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    if (!product) return;

    for (const item of items) {
      if (!item.quantity || Number(item.quantity) < 1) {
        toast.error("Todas las filas deben tener al menos 1 unidad"); return;
      }
      if (Number(item.unit_cost) < 0) {
        toast.error("El costo no puede ser negativo"); return;
      }
    }

    const isCreditCard = paymentMode === "credit_card";
    if (!isCreditCard && !data.account_id)
      return toast.error("Selecciona una cuenta");
    if (isCreditCard && !creditCardId)
      return toast.error("Selecciona una tarjeta de crédito");

    try {
      await createPurchase({
        ...(isCreditCard ? { credit_card_id: creditCardId! } : { account_id: data.account_id! }),
        ...(shippingAccountId && data.shipping > 0 ? { shipping_account_id: shippingAccountId } : {}),
        currency: data.currency,
        exchange_rate: data.exchange_rate,
        shipping: data.shipping,
        notes: data.notes,
        status: isPending ? "PENDING" : "COMPLETED",
        purchased_at: data.purchased_at
          ? localDateToISO(data.purchased_at)
          : new Date().toISOString(),
        items: items.map((item) => ({
          product_id: product.id,
          variant_id: item.variant_key === "base" ? undefined : Number(item.variant_key),
          quantity: Number(item.quantity),
          unit_cost_usd: Number(item.unit_cost),
        })),
      });

      toast.success(
        isPending
          ? `Compra pendiente registrada — el stock se acreditará al confirmar llegada`
          : `${totalUnits} unidades registradas para ${product.name}`
      );
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al registrar el inventario");
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────

  const getVariantLabel = (variantKey: VariantKey) => {
    if (variantKey === "base") return `${product?.name ?? "Producto"} (base)`;
    const v = product?.variants.find((v) => String(v.id) === variantKey);
    return v?.variant_name ?? "Variante";
  };

  const getVariantPrice = (variantKey: VariantKey): number => {
    if (variantKey === "base") return Number(product?.price ?? 0);
    const v = product?.variants.find((v) => String(v.id) === variantKey);
    return v?.price_override != null ? Number(v.price_override) : Number(product?.price ?? 0);
  };

  if (!product) return null;

  const hasVariants = product.variants.length > 0;
  const maxItems = product.variants.length + 1; // base + cada variante
  const canAddMore = !hasVariants ? false : items.length < maxItems;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Agregar stock"
      icon={PackagePlus}
      subtitle={
        <>
          {product.name}
          {product.sku && (
            <span className="font-mono ml-2 text-xs">({product.sku})</span>
          )}
        </>
      }
      width="2xl"
      as="form"
      formProps={{ id: "add-inventory-form", onSubmit: handleSubmit(onSubmit) }}
      footer={
        <>
          <Button
            type="button" variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit" form="add-inventory-form"
            disabled={isCreating}
            className="flex-1 h-11 gap-2"
          >
            {isCreating
              ? <><Loader2 className="size-4 animate-spin" />Registrando…</>
              : isPending
                ? <><Clock className="size-4" />Registrar como pendiente</>
                : <><PackagePlus className="size-4" />Registrar compra</>
            }
          </Button>
        </>
      }
    >
          {/* Modo de pago */}
          {creditCards.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setPaymentMode("account")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  paymentMode === "account" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Wallet className="size-3" /> Cuenta
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode("credit_card")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  paymentMode === "credit_card" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CreditCard className="size-3" /> Tarjeta
              </button>
            </div>
          )}

          {/* Cuenta */}
          {paymentMode === "account" && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Wallet className="size-3.5 text-muted-foreground" />
              Cuenta <span className="text-destructive text-xs">*</span>
            </Label>
            <Select
              onValueChange={(val) => setValue("account_id", Number(val))}
              disabled={isCreating}
            >
              <SelectTrigger className={cn("h-11 w-full", errors.account_id && "border-destructive")}>
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    <div className="flex items-center justify-between gap-8 w-full">
                      <span>{a.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(Number(a.balance))}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          {/* Tarjeta de crédito */}
          {paymentMode === "credit_card" && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <CreditCard className="size-3.5 text-muted-foreground" />
              Tarjeta de crédito <span className="text-destructive text-xs">*</span>
            </Label>
            <Select
              value={creditCardId ? String(creditCardId) : ""}
              onValueChange={(val) => setCreditCardId(Number(val))}
              disabled={isCreating}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Selecciona una tarjeta" />
              </SelectTrigger>
              <SelectContent>
                {creditCards.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.last_four ? ` ···· ${c.last_four}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          {/* Moneda + Tasa */}
          <div className={`grid gap-3 ${isUSD ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Moneda</Label>
              <Select
                defaultValue="USD"
                onValueChange={(val) => setValue("currency", val as "USD" | "HNL")}
                disabled={isCreating}
              >
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
                <Label className="text-sm font-medium">USD → {symbol}</Label>
                <Input
                  type="number" step="0.01"
                  placeholder={`${TASA_DEFAULT}`}
                  {...register("exchange_rate")}
                  disabled={isCreating}
                  className="h-11 text-base"
                />
                {errors.exchange_rate && (
                  <p className="text-xs text-destructive">{errors.exchange_rate.message}</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* ── Items dinámicos ────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {hasVariants ? "Producto / variantes" : "Cantidad y costo"}
              </Label>
              {canAddMore && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addItem}
                  disabled={isCreating}
                  className="h-7 text-xs gap-1 text-primary hover:text-primary"
                >
                  <Plus className="size-3" />
                  Agregar fila
                </Button>
              )}
            </div>

            {/* Cabecera de columnas */}
            <div className={cn(
              "grid gap-2 text-xs text-muted-foreground font-medium",
              hasVariants
                ? "grid-cols-[1fr_72px_96px_32px]"
                : "grid-cols-[72px_96px]"
            )}>
              {hasVariants && <span>Variante</span>}
              <span className="text-center">Cant.</span>
              <span>Costo ({isUSD ? "USD" : symbol})</span>
              {hasVariants && <span />}
            </div>

            {/* Filas */}
            {items.map((item) => {
              const qty = Number(item.quantity) || 0;
              const cost = Number(item.unit_cost) || 0;
              const costHnl = isUSD ? cost * rate : cost;
              const unitFinal = costHnl + shippingPerUnit;
              const salePrice = getVariantPrice(item.variant_key);
              const margin = salePrice - unitFinal;
              const used = usedVariantKeys(item.key);

              return (
                <div key={item.key} className="space-y-1">
                  <div className={cn(
                    "grid gap-2 items-center",
                    hasVariants
                      ? "grid-cols-[1fr_72px_96px_32px]"
                      : "grid-cols-[72px_96px]"
                  )}>
                    {/* Selector de variante */}
                    {hasVariants && (
                      <Select
                        value={item.variant_key}
                        onValueChange={(val) => updateItem(item.key, "variant_key", val)}
                        disabled={isCreating}
                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base" disabled={used.includes("base")}>
                            <span className={cn(used.includes("base") && "opacity-40")}>
                              {product.name} (base)
                            </span>
                          </SelectItem>
                          {product.variants.map((v) => {
                            const isUsed = used.includes(String(v.id));
                            return (
                              <SelectItem key={v.id} value={String(v.id)} disabled={isUsed}>
                                <span className={cn(isUsed && "opacity-40")}>
                                  {v.variant_name}
                                  {v.price_override != null && v.price_override !== product.price && (
                                    <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                                      {format(v.price_override)}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Cantidad */}
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, "quantity", e.target.value)}
                      disabled={isCreating}
                      className="h-10 text-sm text-center"
                    />

                    {/* Costo */}
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                        {isUSD ? "$" : symbol}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(item.key, "unit_cost", e.target.value)}
                        disabled={isCreating}
                        className="h-10 text-sm pl-5"
                      />
                    </div>

                    {/* Eliminar fila */}
                    {hasVariants && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.key)}
                        disabled={isCreating || items.length === 1}
                        className="h-10 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Mini resumen por fila */}
                  {qty > 0 && cost > 0 && (
                    <p className="text-xs text-muted-foreground leading-none pl-0.5">
                      {qty} × {format(unitFinal)} ={" "}
                      <span className="font-medium text-foreground">{format(unitFinal * qty)}</span>
                      {salePrice > 0 && (
                        <span className={cn(
                          "ml-2 font-medium",
                          margin >= 0 ? "text-green-600" : "text-destructive"
                        )}>
                          Margen: {format(margin)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
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
              onCheckedChange={(checked) => {
                setIsPending(checked);
                if (checked) {
                  setValue("shipping", 0);
                  setShippingAccountId(null);
                }
              }}
              disabled={isCreating}
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
              {ship > 0 && totalUnits > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  · {format(shippingPerUnit)}/ud distribuido entre {totalUnits} uds
                </span>
              )}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {symbol}
              </span>
              <Input
                type="number" step="0.01" min="0" placeholder="0.00"
                {...register("shipping")}
                disabled={isCreating}
                className="h-11 pl-8 text-base"
              />
            </div>
          </div>}

          {/* Cuenta para el envío (solo si hay envío y hay cuentas disponibles) */}
          {!isPending && ship > 0 && accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Truck className="size-3.5 text-muted-foreground" />
                Cuenta para el envío
                <span className="text-xs text-muted-foreground font-normal">
                  {paymentMode === "account" ? "(opcional, si es diferente a la cuenta principal)" : ""}
                </span>
              </Label>
              <Select
                value={shippingAccountId ? String(shippingAccountId) : "none"}
                onValueChange={(v) => setShippingAccountId(v === "none" ? null : Number(v))}
                disabled={isCreating}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Misma cuenta / tarjeta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {paymentMode === "credit_card" ? "Incluir en tarjeta" : "Misma cuenta principal"}
                  </SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      <div className="flex items-center justify-between gap-8 w-full">
                        <span>{a.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {format(Number(a.balance))}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shippingAccountId && (
                <p className="text-xs text-muted-foreground">
                  Se debitarán {isUSD ? `${format(shippingPerUnit * totalUnits)} (≈)` : format(ship)} de esta cuenta por el envío.
                </p>
              )}
            </div>
          )}

          {/* Resumen total */}
          {totalUnits > 0 && totalCost > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2">
                <Calculator className="size-3.5" />
                Resumen de la compra
              </div>
              {items
                .filter((i) => Number(i.quantity) > 0 && Number(i.unit_cost) > 0)
                .map((item) => {
                  const qty = Number(item.quantity);
                  const cost = Number(item.unit_cost);
                  const costHnl = isUSD ? cost * rate : cost;
                  const unitFinal = costHnl + shippingPerUnit;
                  return (
                    <div key={item.key} className="flex justify-between text-xs text-muted-foreground">
                      <span className="truncate max-w-[55%]">{getVariantLabel(item.variant_key)}</span>
                      <span>
                        {qty} uds · {format(unitFinal)}/u ={" "}
                        <span className="font-medium text-foreground">{format(unitFinal * qty)}</span>
                      </span>
                    </div>
                  );
                })}
              {ship > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Envío total</span>
                  <span>{format(ship)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between text-sm font-bold text-primary">
                <span>Total ({totalUnits} uds)</span>
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
              {...register("purchased_at")}
              disabled={isCreating}
              className="h-11 text-base"
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Notas
              <span className="text-xs text-muted-foreground font-normal ml-1">opcional</span>
            </Label>
            <Input
              placeholder="Ej: Reposición de stock, lote #2..."
              {...register("notes")}
              disabled={isCreating}
              className="h-11 text-base"
            />
          </div>
    </ResponsiveModal>
  );
}
