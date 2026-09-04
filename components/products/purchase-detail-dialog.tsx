// components/products/purchase-detail-dialog.tsx
"use client";

import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingBag, Wallet, Truck, StickyNote, CalendarDays } from "lucide-react";
import { usePurchase } from "@/hooks/swr/use-purchases";
import { useCurrency } from "@/hooks/swr/use-currency";

type Props = {
  purchaseId:   number | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
};

export function PurchaseDetailDialog({ purchaseId, open, onOpenChange }: Props) {
  const { purchase, isLoading } = usePurchase(open ? purchaseId : null);
  const { format } = useCurrency();

  const date = purchase
    ? new Date(purchase.purchased_at).toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const itemCount = purchase?.items.length ?? 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={purchase?.is_group ? "Detalle de importación" : "Detalle de compra"}
      icon={ShoppingBag}
      subtitle={
        purchase
          ? <>{date} · {itemCount} producto{itemCount !== 1 ? "s" : ""}</>
          : undefined
      }
      footer={
        <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      }
    >
      {isLoading || !purchase ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-2 text-sm">
            {purchase.account_name && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Wallet className="size-3.5" /> Cuenta
                </span>
                <span className="font-medium">{purchase.account_name}</span>
              </div>
            )}
            {purchase.shipping != null && Number(purchase.shipping) > 0 && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Truck className="size-3.5" /> Envío
                </span>
                <span className="font-medium">
                  {format(Number(purchase.shipping))}
                  {purchase.shipping_account_name && ` (${purchase.shipping_account_name})`}
                </span>
              </div>
            )}
            {purchase.total != null && (
              <>
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span>{format(Number(purchase.total))}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" /> {date}
            </span>
            {purchase.status && (
              <Badge variant="outline" className="text-xs">
                {purchase.status === "PENDING" ? "Pendiente de llegada" : "Completada"}
              </Badge>
            )}
          </div>

          {purchase.notes && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <StickyNote className="size-3.5 shrink-0 mt-0.5" />
              <span>{purchase.notes}</span>
            </div>
          )}

          {/* Items del lote */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Productos en este lote
            </p>
            <div className="rounded-xl border overflow-hidden divide-y">
              {purchase.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-sm font-medium">
                      {item.product_name}
                      {item.variant_name && (
                        <span className="text-muted-foreground font-normal"> · {item.variant_name}</span>
                      )}
                    </span>
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground">
                    <span className="font-mono">{item.quantity}</span>
                    {item.unit_cost != null && (
                      <>
                        <span className="mx-1 opacity-50">×</span>
                        <span>{format(Number(item.unit_cost))}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </ResponsiveModal>
  );
}
