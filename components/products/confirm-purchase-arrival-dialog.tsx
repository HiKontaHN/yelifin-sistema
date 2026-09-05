// components/products/confirm-purchase-arrival-dialog.tsx
"use client";

import { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Truck, PackageCheck, AlertTriangle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirmPurchaseArrival, Purchase } from "@/hooks/swr/use-purchases";
import { useCurrency } from "@/hooks/swr/use-currency";

type Account = { id: number; name: string; balance: number | null };

type Props = {
  purchase:     Purchase | null;
  accounts:     Account[];
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function ConfirmPurchaseArrivalDialog({
  purchase, accounts, open, onOpenChange, onSuccess,
}: Props) {
  const { confirmArrival, isConfirming } = useConfirmPurchaseArrival(purchase?.id ?? null);
  const { format, symbol }               = useCurrency();

  const [newShipping,       setNewShipping]       = useState("");
  const [shippingAccountId, setShippingAccountId] = useState<string>("stored");
  const [wantsShipping,     setWantsShipping]     = useState(false);

  useEffect(() => {
    if (open && purchase) {
      const hadShipping = Number(purchase.shipping ?? 0) > 0;
      setNewShipping(hadShipping ? String(purchase.shipping ?? 0) : "");
      setShippingAccountId("stored");
      setWantsShipping(hadShipping);
    }
  }, [open, purchase]);

  if (!purchase) return null;

  const originalShipping = Number(purchase.shipping ?? 0);
  const parsedShipping   = (!wantsShipping && originalShipping === 0)
    ? 0
    : newShipping === "" ? 0 : Math.max(0, Number(newShipping));
  const shippingDelta    = parsedShipping - originalShipping;
  const newTotal         = Number(purchase.total ?? 0) + shippingDelta;
  const hasAdjustment    = shippingDelta !== 0;

  // Qué cuenta se muestra en el resumen del ajuste
  const effectiveAccId = shippingAccountId === "stored" ? null : Number(shippingAccountId);
  const storedShippingName = purchase.shipping_account_name ?? purchase.account_name ?? null;
  const selectedAcc = effectiveAccId
    ? accounts.find((a) => a.id === effectiveAccId)
    : null;
  const adjustmentAccountName = selectedAcc?.name ?? storedShippingName ?? "—";

  const handleConfirm = async () => {
    try {
      await confirmArrival(
        newShipping === "" ? 0 : parsedShipping,
        effectiveAccId ?? undefined,
      );
      toast.success("Inventario registrado exitosamente");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al confirmar la llegada");
    }
  };

  const purchasedDate = new Date(purchase.purchased_at).toLocaleDateString("es-HN", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && onOpenChange(false)}
      title="Confirmar llegada"
      icon={PackageCheck}
      subtitle={
        <>
          Compra del <span suppressHydrationWarning>{purchasedDate}</span> · {purchase.items_count} producto{purchase.items_count !== 1 ? "s" : ""}
        </>
      }
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="flex-1 h-11 gap-2"
          >
            {isConfirming
              ? <><Loader2 className="size-4 animate-spin" />Registrando…</>
              : <><PackageCheck className="size-4" />Confirmar llegada</>
            }
          </Button>
        </>
      }
    >
          {/* Resumen original */}
          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal productos</span>
              <span>{format(Number(purchase.subtotal ?? 0) - originalShipping)}</span>
            </div>
            {originalShipping > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Envío original
                  {storedShippingName && (
                    <span className="ml-1 text-xs">({storedShippingName})</span>
                  )}
                </span>
                <span>{format(originalShipping)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total pagado</span>
              <span>{format(Number(purchase.total ?? 0))}</span>
            </div>
          </div>

          {/* Pregunta de envío */}
          {originalShipping === 0 ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Truck className="size-3.5 text-muted-foreground" />
                ¿Llegó con costo de envío?
              </Label>
              <div className="flex items-center gap-4 border-b">
                <button
                  type="button"
                  onClick={() => { setWantsShipping(false); setNewShipping(""); }}
                  disabled={isConfirming}
                  className={cn(
                    "border-b-2 border-transparent px-0.5 pb-2 text-sm font-medium transition-colors",
                    !wantsShipping
                      ? "border-foreground text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  No, sin envío
                </button>
                <button
                  type="button"
                  onClick={() => setWantsShipping(true)}
                  disabled={isConfirming}
                  className={cn(
                    "border-b-2 border-transparent px-0.5 pb-2 text-sm font-medium transition-colors",
                    wantsShipping
                      ? "border-foreground text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Sí, agregar envío
                </button>
              </div>

              {wantsShipping && (
                <div className="space-y-1.5">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                      {symbol}
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newShipping}
                      onChange={(e) => setNewShipping(e.target.value)}
                      disabled={isConfirming}
                      className="h-11 pl-8 text-base"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se distribuye entre las {purchase.items_count} línea{purchase.items_count !== 1 ? "s" : ""} de productos.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Truck className="size-3.5 text-muted-foreground" />
                Costo de envío real
                <span className="text-xs text-muted-foreground font-normal">
                  · original: {format(originalShipping)}
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
                  value={newShipping}
                  onChange={(e) => setNewShipping(e.target.value)}
                  disabled={isConfirming}
                  className="h-11 pl-8 text-base"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se distribuye entre todas las unidades.
              </p>
            </div>
          )}

          {/* Cuenta para el envío — solo si hay envío y hay cuentas */}
          {parsedShipping > 0 && accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Wallet className="size-3.5 text-muted-foreground" />
                Cuenta para el envío
              </Label>
              <Select
                value={shippingAccountId}
                onValueChange={setShippingAccountId}
                disabled={isConfirming}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stored">
                    {storedShippingName ? `Original (${storedShippingName})` : "Misma cuenta de la compra"}
                  </SelectItem>
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
          )}

          {/* Ajuste financiero si el envío cambió */}
          {hasAdjustment && (
            <div className={cn(
              "rounded-xl border p-3.5 space-y-1.5 text-sm",
              shippingDelta > 0
                ? "border-red-200 bg-red-50/60 dark:bg-red-950/20"
                : "border-green-200 bg-green-50/60 dark:bg-green-950/20"
            )}>
              <div className="flex items-center gap-1.5 font-medium text-xs mb-1">
                <AlertTriangle className="size-3.5" />
                Ajuste financiero automático
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Envío original</span>
                <span>{format(originalShipping)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Envío real</span>
                <span>{format(parsedShipping)}</span>
              </div>
              <Separator />
              <div className={cn(
                "flex justify-between font-semibold",
                shippingDelta > 0 ? "text-red-700" : "text-green-700"
              )}>
                <span>{shippingDelta > 0 ? "Cargo adicional" : "Devolución"}</span>
                <span>{shippingDelta > 0 ? "-" : "+"}{format(Math.abs(shippingDelta))}</span>
              </div>
              <div className="flex justify-between font-bold pt-0.5">
                <span>Nuevo total</span>
                <span>{format(newTotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-0.5">
                Cuenta: {adjustmentAccountName}
              </p>
            </div>
          )}

          {/* Info */}
          <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-xs text-muted-foreground leading-relaxed">
            Al confirmar, se acreditarán{" "}
            <span className="font-semibold text-foreground">
              {purchase.items_count} línea{purchase.items_count !== 1 ? "s" : ""} de stock
            </span>{" "}
            al inventario
            {hasAdjustment && (
              <>
                {" "}y se{" "}
                {shippingDelta > 0 ? "debitarán" : "acreditarán"}{" "}
                <span className="font-semibold text-foreground">
                  {format(Math.abs(shippingDelta))}
                </span>{" "}
                {shippingDelta > 0 ? "adicionales" : "de vuelta"} a la cuenta.
              </>
            )}
          </div>
    </ResponsiveModal>
  );
}
