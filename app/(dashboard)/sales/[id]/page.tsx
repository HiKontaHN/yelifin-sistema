// app/(dashboard)/sales/[id]/page.tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Receipt,
  User,
  Package,
  TrendingUp,
  Tag,
  Building2,
  Truck,
  ShoppingBag,
  Clock,
  CheckCircle,
  Layers,
  FileText,
  Printer,
  NotebookPen,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from "lucide-react";

import { useSale, usePatchSale } from "@/hooks/swr/use-sales";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTimezone, formatInTZ } from "@/hooks/swr/use-timezone";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CancelSaleDialog } from "@/components/sales/cancel-sale-dialog";

type Props = { params: Promise<{ id: string }> };

const getTaxRate = (v: any): number => Number(v) || 0;

export default function SaleDetailPage({ params }: Props) {
  const { id }              = use(params);
  const numericId           = Number(id);
  const { sale, isLoading } = useSale(numericId);
  const { confirmSale, cancelSale, isPatching } = usePatchSale(numericId);
  const { refresh, push, back } = useRouter();
  const { format }          = useCurrency();
  const tz                  = useTimezone();
  const { show_costs: showCosts, show_profit: showProfit } = useModulePermissions("SALES");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen,  setCancelOpen]  = useState(false);

  if (isLoading) return <SaleDetailSkeleton />;

  if (!sale)
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Receipt className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Venta no encontrada</p>
        <Button variant="outline" asChild>
          <Link href="/sales">Volver a ventas</Link>
        </Button>
      </div>
    );

  const taxRate        = getTaxRate(sale.tax_rate);
  const taxAmount      = Number(sale.tax ?? 0);
  const shippingAmount = Number(sale.shipping_cost ?? 0);

  const isPending   = sale.status === "PENDING";
  const isCompleted = sale.status === "COMPLETED";
  const isCancelled = sale.status === "CANCELLED";

  // Costo y ganancia vienen calculados y filtrados por el backend según
  // show_costs / show_profit del rol (pueden llegar en null). Los ?? 0 son
  // solo para que el render no truene — las tarjetas que los muestran ya
  // están condicionadas a showCosts/showProfit más abajo.
  const productsCost = Number(sale.products_cost ?? 0);
  const suppliesCost = Number(sale.supplies_cost ?? 0);
  const totalProfit  = Number(sale.net_profit ?? 0);
  const margin       = Number(sale.margin_pct ?? 0);

  const profitLabel = isPending ? "Ganancia estimada" : "Ganancia neta";

  const handleConfirmPayment = async () => {
    try {
      await confirmSale();
      toast.success("Venta confirmada");
      setConfirmOpen(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Error al confirmar la venta");
    }
  };

  const handleCancelSale = async (reason?: string) => {
    try {
      await cancelSale(reason);
      toast.success("Venta cancelada · stock devuelto");
      setCancelOpen(false);
      push("/sales");
    } catch (err: any) {
      toast.error(err.message || "Error al cancelar la venta");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto mb-5">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight font-mono">
                {sale.sale_number}
              </h1>
              {isCompleted && (
                <Badge className="bg-green-100 text-green-700 border-green-200 gap-1" variant="outline">
                  <CheckCircle className="size-3" />
                  Completada
                </Badge>
              )}
              {isPending && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1" variant="outline">
                  <Clock className="size-3" />
                  Pendiente de pago
                </Badge>
              )}
              {isCancelled && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1" variant="outline">
                  <XCircle className="size-3" />
                  Cancelada
                </Badge>
              )}
              {taxRate > 0 && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                  ISV {taxRate}% incluido
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {formatInTZ(sale.sold_at, tz, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Botones factura/ticket — solo visibles en sm+ */}
          <div className="hidden sm:flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link href={`/sales/${sale.id}/invoice`}>
                <FileText className="size-3.5" />
                Factura PDF
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link href={`/sales/${sale.id}/receipt`}>
                <Printer className="size-3.5" />
                Ticket
              </Link>
            </Button>
          </div>
        </div>

        {/* Botones factura/ticket en móvil — segunda fila */}
        <div className="flex sm:hidden gap-2 pl-11">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" asChild>
            <Link href={`/sales/${sale.id}/invoice`}>
              <FileText className="size-3.5" />
              Factura PDF
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" asChild>
            <Link href={`/sales/${sale.id}/receipt`}>
              <Printer className="size-3.5" />
              Ticket
            </Link>
          </Button>
        </div>
      </div>

   
      {/* Aviso si está pendiente + acciones */}
      {isPending && (
        <Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/20">
          <CardContent className="py-3 px-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-amber-800 space-y-0.5">
              <p className="font-semibold">Esta venta está registrada como pendiente.</p>
              <p className="text-[11px]">
                El inventario ya se descontó, pero el pago aún no se ha confirmado.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-end w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => push(`/sales/${sale.id}/edit`)}
              >
                Editar venta
              </Button>
              <Button
                size="sm"
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => setConfirmOpen(true)}
                disabled={isPatching}
              >
                Confirmar pago
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto text-destructive border-destructive/60"
                onClick={() => setCancelOpen(true)}
                disabled={isPatching}
              >
                Cancelar venta
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aviso si fue cancelada */}
      {isCancelled && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 px-3.5 text-xs text-destructive space-y-0.5">
            <p className="font-semibold flex items-center gap-1.5">
              <XCircle className="size-3.5" />
              Esta venta fue cancelada
              {sale.deleted_at && (
                <>
                  {" "}el{" "}
                  {formatInTZ(sale.deleted_at, tz, { day: "numeric", month: "short", year: "numeric" })}
                </>
              )}
              .
            </p>
            {sale.cancellation_reason && (
              <p className="text-[11px] text-destructive/80">
                Motivo: {sale.cancellation_reason}
              </p>
            )}
          </CardContent>
        </Card>
      )}


      {/* Cliente + Cuenta */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pl-3 flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <User className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium text-sm truncate">
                {sale.customer_name ?? "Anónimo"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pl-3 flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Building2 className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cuenta</p>
              <p className="font-medium text-sm truncate">
                {sale.account_name ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen financiero */}
      <div className={`grid gap-3 ${showProfit ? "grid-cols-2" : "grid-cols-1"}`}>
        <Card>
          <CardContent className="pl-3.5 text-center">
            <p className="text-xs text-muted-foreground">Total cobrado</p>
            <p className="text-lg md:text-xl font-bold mt-0.5">
              {format(Number(sale.total))}
            </p>
            {shippingAmount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                incl. envío {format(shippingAmount)}
              </p>
            )}
            {taxRate > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                incl. ISV {format(taxAmount)}
              </p>
            )}
          </CardContent>
        </Card>

        {showProfit && (
          <Card className={isPending
            ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
            : "border-green-200 bg-green-50 dark:bg-green-950/20"}
          >
            <CardContent className="pl-3.5 text-center">
              <p className="text-xs text-muted-foreground">{profitLabel}</p>
              <p className={`text-lg md:text-xl font-bold mt-0.5 ${
                isPending ? "text-amber-700" : "text-green-600"
              }`}>
                {format(totalProfit)}
              </p>
              <p className={`text-xs ${
                isPending ? "text-amber-700" : "text-green-600"
              }`}>
                {margin.toFixed(1)}% margen
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Productos vendidos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="size-4" />
            Productos vendidos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {sale.items.map((item) => {
            return (
              <div key={item.id} className="flex gap-3 p-3 rounded-lg border">
                <div className="relative size-12 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.product_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Package className="size-5 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product_name}</p>
                  {item.variant_name && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Layers className="size-3 text-primary shrink-0" />
                      <p className="text-xs text-primary font-medium truncate">{item.variant_name}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span>
                      {item.quantity} × {format(Number(item.unit_price))}
                    </span>
                    {showCosts && item.unit_cost !== null && (
                      <span>Costo: {format(Number(item.unit_cost))}/u</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">
                    {format(Number(item.line_total))}
                  </p>
                  {showProfit && item.item_profit !== null && (
                    <>
                      <p className="text-xs text-green-600 font-medium">
                        +{format(item.item_profit)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Number(item.item_margin ?? 0).toFixed(1)}%
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Suministros usados */}
      {(sale.supplies ?? []).length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <ShoppingBag className="size-4" />
              Suministros usados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {sale.supplies.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-orange-50/50 dark:bg-orange-950/20"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.supply_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.quantity} × {format(Number(s.unit_cost))}
                  </p>
                </div>
                <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 shrink-0">
                  -{format(Number(s.line_total))}
                </p>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1 border-t border-orange-200/60">
              <span className="text-xs text-orange-600">Total suministros</span>
              <span className="text-sm font-bold text-orange-700 dark:text-orange-400">
                -{format(suppliesCost)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desglose de totales — oculto por completo sin costos y ganancias,
          ya que mezcla costo (show_costs) y ganancia neta (show_profit) */}
      {showCosts && showProfit && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="size-4" />
            Desglose
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal productos</span>
            <span>{format(Number(sale.subtotal))}</span>
          </div>

          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Descuento</span>
              <span>-{format(Number(sale.discount))}</span>
            </div>
          )}

          {shippingAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Truck className="size-3.5" />
                Envío
              </span>
              <span>+{format(shippingAmount)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between font-bold">
            <span>Total cobrado</span>
            <span>{format(Number(sale.total))}</span>
          </div>

          {/* ISV como nota informativa — está dentro del precio, no lo suma */}
          {taxRate > 0 && (
            <div className="flex justify-between text-amber-600 text-xs">
              <span>ISV {taxRate}% incluido en el precio</span>
              <span>-{format(taxAmount)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-muted-foreground">
            <span>Costo productos</span>
            <span>-{format(productsCost)}</span>
          </div>

          {suppliesCost > 0 && (
            <div className="flex justify-between text-orange-600">
              <span className="flex items-center gap-1.5">
                <ShoppingBag className="size-3.5" />
                Costo suministros
              </span>
              <span>-{format(suppliesCost)}</span>
            </div>
          )}

          <Separator />

          <div className={`flex justify-between font-bold ${
            isPending ? "text-amber-700" : "text-green-600"
          }`}>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="size-4" />
              {profitLabel}
            </span>
            <span>{format(totalProfit)}</span>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Notas */}
      {sale.notes && (
        <Card>
          <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <NotebookPen className="size-4" />
            Notas
          </CardTitle>
        </CardHeader>
          <CardContent className="p-4 pt-0 pb-0">
            <p className="text-md">{sale.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Navegación Anterior / Siguiente */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          disabled={!sale.prev_id}
          onClick={() => sale.prev_id && push(`/sales/${sale.prev_id}`)}
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          disabled={!sale.next_id}
          onClick={() => sale.next_id && push(`/sales/${sale.next_id}`)}
        >
          Siguiente
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Dialogs de confirmación */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar pago de esta venta"
        description="Se registrará el pago y la venta pasará a estado Completada."
        confirmLabel="Confirmar pago"
        cancelLabel="Volver"
        variant="warning"
        isLoading={isPatching}
        onConfirm={handleConfirmPayment}
      />

      <CancelSaleDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar esta venta"
        description="Se devolverá el stock al inventario y la venta quedará marcada como cancelada."
        isLoading={isPatching}
        onConfirm={handleCancelSale}
      />
    </div>
  );
}

function SaleDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}