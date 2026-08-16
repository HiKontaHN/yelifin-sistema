// components/products/cancel-purchase-dialog.tsx
"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { useCancelPurchase, Purchase } from "@/hooks/swr/use-purchases";
import { useCurrency } from "@/hooks/swr/use-currency";

type Props = {
  purchase:     Purchase | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function CancelPurchaseDialog({ purchase, open, onOpenChange, onSuccess }: Props) {
  const { cancelPurchase, isCancelling } = useCancelPurchase();
  const { format } = useCurrency();

  const handleCancel = async () => {
    if (!purchase) return;
    try {
      const res = await cancelPurchase(purchase.id);
      toast.success(res?.message || "Compra cancelada");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al cancelar la compra");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Cancelar esta compra?"
      description={
        purchase
          ? `Se cancelará el pedido de ${purchase.items_count} producto${purchase.items_count !== 1 ? "s" : ""}${
              purchase.total !== null ? ` por ${format(Number(purchase.total))}` : ""
            } y se devolverá el dinero a la cuenta o tarjeta de origen. Esta acción no se puede deshacer.`
          : undefined
      }
      confirmLabel="Cancelar compra"
      cancelLabel="Volver"
      variant="danger"
      isLoading={isCancelling}
      onConfirm={handleCancel}
    />
  );
}
