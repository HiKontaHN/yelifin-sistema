// components/supplies/add-supply-purchase-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShoppingBag, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useCreateSupplyPurchase, Supply } from "@/hooks/swr/use-supplies";
import { localDateToISO, toLocalDateInput } from "@/lib/date-utils";
import { useAccounts } from "@/hooks/swr/use-accounts";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 0,
  }).format(v);

type Props = {
  supply: Supply | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function AddSupplyPurchaseDialog({
  supply,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { createSupplyPurchase, isCreating } = useCreateSupplyPurchase();
  const { accounts } = useAccounts();

  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(
    toLocalDateInput(new Date())
  );

  const qty = Number(quantity) || 0;
  const cost = Number(unitCost) || 0;
  const total = qty * cost;

  useEffect(() => {
    if (open && supply) {
      setAccountId("");
      setQuantity("1");
      setUnitCost(supply.unit_cost > 0 ? String(supply.unit_cost) : "");
      setPurchasedAt(toLocalDateInput(new Date()));
    }
  }, [open, supply]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const onSubmit = async () => {
    if (!supply) return;
    if (!accountId) return toast.error("Selecciona una cuenta");
    if (qty <= 0) return toast.error("La cantidad debe ser mayor a 0");
    if (cost < 0) return toast.error("El costo no puede ser negativo");

    try {
      await createSupplyPurchase({
        account_id: Number(accountId),
        purchased_at: localDateToISO(purchasedAt),
        items: [{ supply_id: supply.id, quantity: qty, unit_cost: cost }],
      });

      toast.success(`${qty} ${supply.unit ?? "uds"} de ${supply.name} agregados`);
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al registrar la compra");
    }
  };

  if (!supply) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Registrar compra"
      icon={ShoppingBag}
      subtitle={supply.name}
      width="wide"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={onSubmit}
            disabled={isCreating}
            className="flex-1 h-11 gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Registrando…
              </>
            ) : (
              "Registrar compra"
            )}
          </Button>
        </>
      }
    >
          {/* Cuenta */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Wallet className="size-3.5 text-muted-foreground" />
              Cuenta <span className="text-destructive text-xs">*</span>
            </Label>

            <Select
              value={accountId}
              onValueChange={setAccountId}
              disabled={isCreating}
            >
              <SelectTrigger className="w-full h-11 text-left">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    <div className="flex items-center justify-between gap-4 w-full">
                      <span>{a.name}</span>
                      {a.balance !== null && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatCurrency(Number(a.balance))}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Cantidad + costo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quantity" className="text-sm font-medium">
                Cantidad ({supply.unit ?? "uds"}){" "}
                <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={isCreating}
                className="h-11 text-base"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unit_cost" className="text-sm font-medium">
                Costo unitario (L)
              </Label>
              <Input
                id="unit_cost"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                disabled={isCreating}
                className="h-11 text-base"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Total */}
          {qty > 0 && cost > 0 && (
            <div className="bg-muted/40 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total a descontar
              </span>
              <span className="font-bold text-primary">
                {formatCurrency(total)}
              </span>
            </div>
          )}

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label htmlFor="purchased_at" className="text-sm font-medium">
              Fecha de compra
            </Label>
            <Input
              id="purchased_at"
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              disabled={isCreating}
              className="h-11 text-base"
              autoComplete="off"
            />
          </div>
    </ResponsiveModal>
  );
}