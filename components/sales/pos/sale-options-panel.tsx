// components/sales/pos/sale-options-panel.tsx
"use client";

import type React from "react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, User, Wallet, ShoppingBag, Truck, ArrowLeft, Clock, Star,
} from "lucide-react";
import { useCurrency } from "@/hooks/swr/use-currency";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { TIER_COLOR_CLASSES, type LoyaltyPolicy } from "@/hooks/swr/use-costumers";
import { cn } from "@/lib/utils";

type Props = {
  customers: any[];
  accounts: any[];
  hasSupplies: boolean;
  customerId: number | null;
  accountId: number | null;
  notes: string;
  grandTotal: number;
  shippingCost: number;
  isCreating: boolean;
  isPending: boolean;
  onCustomerChange: (id: number | null) => void;
  onAccountChange: (id: number) => void;
  onNotesChange: (v: string) => void;
  onShippingCostChange: (v: number) => void;
  onIsPendingChange: (v: boolean) => void;
  onCheckout: () => void;
  onOpenSupplies: () => void;
  onBack?: () => void;
  loyaltyTier?: LoyaltyPolicy | null;
  onApplyLoyaltyDiscount?: (pct: number) => void;
};

export function SaleOptionsPanel({
  customers,
  accounts,
  hasSupplies,
  customerId,
  accountId,
  notes,
  grandTotal,
  shippingCost,
  isCreating,
  isPending,
  onCustomerChange,
  onAccountChange,
  onNotesChange,
  onShippingCostChange,
  onIsPendingChange,
  onCheckout,
  onOpenSupplies,
  onBack,
  loyaltyTier,
  onApplyLoyaltyDiscount,
}: Props) {
  const { format, symbol } = useCurrency();

  // --- estado para el confirm dialog ---
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleMainActionClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    onCheckout();
  };

  const confirmTitle = isPending
    ? "¿Guardar venta como pendiente?"
    : "¿Confirmar venta?";
  const confirmDescription = isPending
    ? "La venta quedará registrada como pendiente. El inventario se descuenta, pero el pago queda abierto hasta que lo confirmes."
    : "Se registrará el pago y la venta quedará completada. Esta acción no se puede deshacer.";
  const confirmLabel = isPending
    ? "Guardar como pendiente"
    : "Confirmar venta";

  return (
    <>
      <Card className="flex flex-col min-h-0">
        <CardContent
          className="flex flex-col gap-3 pt-4 px-4 pb-4 min-h-0 overflow-y-auto"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <User className="size-3.5" />
              Cliente
              <span className="text-muted-foreground ml-1">(opcional)</span>
            </Label>
            <SearchableSelect
              value={customerId?.toString() ?? "anonymous"}
              onValueChange={(v) => onCustomerChange(v === "anonymous" ? null : Number(v))}
              items={customers.map((c) => ({
                value: c.id.toString(),
                label: c.name
              }))}
              defaultOption={{ value: "anonymous", label: "Venta anónima" }}
              placeholder="Venta anónima"
              searchPlaceholder="Buscar cliente..."
              className="h-8 text-sm w-full"
            />
          </div>

          {/* Sugerencia de fidelización */}
          {loyaltyTier && (() => {
            const colors = TIER_COLOR_CLASSES[loyaltyTier.color] ?? TIER_COLOR_CLASSES.amber;
            return (
              <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2.5", colors.border, colors.bg)}>
                <Star className={cn("size-3.5 shrink-0", colors.text)} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[11px] font-semibold leading-tight", colors.text)}>
                    Cliente {loyaltyTier.tier_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Descuento sugerido: {loyaltyTier.discount_pct}%
                  </p>
                </div>
                {onApplyLoyaltyDiscount && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn("h-7 text-xs shrink-0 border", colors.border, colors.text)}
                    onClick={() => onApplyLoyaltyDiscount(Number(loyaltyTier.discount_pct))}
                  >
                    Aplicar
                  </Button>
                )}
              </div>
            );
          })()}

          {/* Cuenta destino */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              Cuenta de destino *
            </Label>
            <Select
              value={accountId?.toString() ?? ""}
              onValueChange={(v) => onAccountChange(Number(v))}
            >
              <SelectTrigger className="h-8 text-sm w-full">
                <SelectValue placeholder="Seleccionar cuenta..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Envío */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Truck className="size-3.5" />
              Costo de envío
              <span className="text-muted-foreground ml-1">(opcional)</span>
            </Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                {symbol}
              </span>
              <Input
                type="number"
                value={shippingCost === 0 ? "" : shippingCost}
                onChange={(e) => {
                  const raw = e.target.value.replace(/^0+(\d)/, "$1");
                  const n = parseFloat(raw);
                  onShippingCostChange(isNaN(n) ? 0 : Math.max(0, n));
                }}
                placeholder="0"
                min="0"
                step="0.01"
                className="h-8 text-sm pl-7"
              />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Notas <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Observaciones..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Suministros */}
          {hasSupplies && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={onOpenSupplies}
              type="button"
            >
              <ShoppingBag className="size-3.5 text-primary" />
              Agregar suministros usados
            </Button>
          )}

          {/* Toggle venta pendiente (versión que ya te funciona) */}
          <button
            type="button"
            onClick={() => onIsPendingChange(!isPending)}
            className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-xs flex items-center gap-3 cursor-pointer transition-colors
            ${isPending
                ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                : "border-border hover:bg-muted/50"
              }`}
          >
            {/* Texto + icono */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Clock
                className={`size-3.5 shrink-0 ${isPending ? "text-amber-600" : "text-muted-foreground"
                  }`}
              />
              <div className="min-w-0">
                <p
                  className={`text-[11px] font-semibold leading-tight ${isPending ? "text-amber-700" : "text-foreground"
                    }`}
                >
                  Registrar como pendiente
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {isPending
                    ? "Inventario descontado · pago pendiente"
                    : "El pago se registra al confirmar"}
                </p>
              </div>
            </div>

            {/* Switch visual */}
            <div
              className={`relative shrink-0 h-5 w-9 rounded-full flex items-center transition-colors ${isPending ? "bg-amber-500" : "bg-muted-foreground/30"
                }`}
            >
              <span
                className={`size-4 rounded-full bg-white shadow transition-transform ${isPending ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
              />
            </div>
          </button>

          {/* Botones de acción */}
          <div className="flex gap-2 pt-1">
            {onBack && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBack}
                disabled={isCreating}
                className="gap-1.5 shrink-0"
                type="button"
              >
                <ArrowLeft className="size-3.5" />
                Carrito
              </Button>
            )}
            <Button
              className={`flex-1 gap-2 ${isPending ? "bg-amber-500 hover:bg-amber-600 text-white" : ""
                }`}
              onClick={handleMainActionClick}
              disabled={isCreating}
              type="button"
            >
              {isCreating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Procesando…
                </>
              ) : isPending ? (
                <>
                  <Clock className="size-3.5" />
                  Guardar pendiente · {format(grandTotal)}
                </>
              ) : (
                `Confirmar venta · ${format(grandTotal)}`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ConfirmDialog reutilizable */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isPending ? "¿Guardar venta como pendiente?" : "¿Confirmar venta?"}
        description={
          isPending
            ? "La venta se registrará como pendiente. El inventario se descontará, pero el pago quedará abierto."
            : "Se registrará el pago y la venta quedará completada. Esta acción no se puede deshacer."
        }
        confirmLabel={isPending ? "Guardar pendiente" : "Confirmar venta"}
        variant={isPending ? "warning" : "default"}
        onConfirm={handleConfirm}
      />
    </>
  );
}