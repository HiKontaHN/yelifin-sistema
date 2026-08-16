// app/(dashboard)/events/[id]/page.tsx
"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Calendar, MapPin, TrendingUp,
  TrendingDown, DollarSign, ShoppingCart,
  Banknote, CreditCard, ArrowLeftRight, HelpCircle, Tag, Pencil, Receipt,
} from "lucide-react";
import { useCurrency }       from "@/hooks/swr/use-currency";
import { useEvent }          from "@/hooks/swr/use-events";
import { Fab, FabAction }    from "@/components/ui/fab";
import { EditEventDialog }   from "@/components/events/edit-event-dialog";
import { AddExpenseDialog }  from "@/components/events/add-expense-dialog";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { PaginationControls } from "@/components/shared/pagination-controls";

const SALES_PAGE_SIZE = 8;

// ── Utils ──────────────────────────────────────────────────────────────
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("es-HN", {
    day: "numeric", month: "short", year: "numeric",
  });

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("es-HN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

const STATUS_CONFIG = {
  PLANNED:   { label: "Planificado", className: "bg-blue-100 text-blue-700 border-blue-200" },
  ACTIVE:    { label: "En curso",    className: "bg-green-100 text-green-700 border-green-200" },
  COMPLETED: { label: "Completado",  className: "bg-gray-100 text-gray-700 border-gray-200" },
};

const PAYMENT_CONFIG: Record<string, { label: string; icon: any }> = {
  CASH:     { label: "Efectivo",      icon: Banknote },
  CARD:     { label: "Tarjeta",       icon: CreditCard },
  TRANSFER: { label: "Transferencia", icon: ArrowLeftRight },
  OTHER:    { label: "Otro",          icon: HelpCircle },
};

type Props = { params: Promise<{ id: string }> };

export default function EventDetailPage({ params }: Props) {
  const { id }       = use(params);
  const { back, push } = useRouter();
  const { format }   = useCurrency();
  const { event, isLoading, mutate } = useEvent(Number(id));
  const { show_profit: showProfit, can_edit: canEdit } = useModulePermissions("EVENTS");
  const { can_edit: salesCanEdit } = useModulePermissions("SALES");
  const [editOpen, setEditOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [salesPage, setSalesPage] = useState(1);

  // Más recientes primero, paginado para no hacer scroll infinito dentro
  // de la card cuando el evento tiene muchas ventas.
  const sortedSales = useMemo(
    () => [...(event?.sales ?? [])].reverse(),
    [event?.sales]
  );
  const totalSalesPages = Math.max(1, Math.ceil(sortedSales.length / SALES_PAGE_SIZE));
  const effectiveSalesPage = Math.min(salesPage, totalSalesPages);
  const pagedSales = sortedSales.slice(
    (effectiveSalesPage - 1) * SALES_PAGE_SIZE,
    effectiveSalesPage * SALES_PAGE_SIZE
  );

  if (isLoading) return <EventDetailSkeleton />;

  if (!event)
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Calendar className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Evento no encontrado</p>
        <Button variant="outline" asChild>
          <Link href="/events">Volver a eventos</Link>
        </Button>
      </div>
    );

  const statusCfg  = STATUS_CONFIG[event.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.COMPLETED;
  const { summary } = event;
  const isProfit   = (summary.net_profit ?? 0) >= 0;
  const extraExpenses = (summary.total_expenses ?? 0) - event.fixed_cost;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => back()} className="shrink-0 mt-0.5">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
            <Badge variant="outline" className={statusCfg.className}>{statusCfg.label}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatDate(event.starts_at)} – {formatDate(event.ends_at)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Métricas principales ── */}
      <div className={`grid gap-3 ${showProfit ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"}`}>
        <Card className="pt-2 pb-2">
          <CardContent className="pl-3.5 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Ventas totales</span>
              <DollarSign className="size-3.5 text-muted-foreground shrink-0" />
            </div>
            <p className="text-base font-bold truncate">{format(summary.total_sales)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.sales_count} transacciones</p>
          </CardContent>
        </Card>

        {showProfit && (
          <Card className="pt-2 pb-2">
            <CardContent className="pl-3.5 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Gastos totales</span>
                <TrendingDown className="size-3.5 text-muted-foreground shrink-0" />
              </div>
              <p className="text-base font-bold text-red-500 truncate">{format(summary.total_expenses ?? 0)}</p>
              {event.fixed_cost > 0 && (
                <p className="text-[10px] text-muted-foreground">incl. fijo {format(event.fixed_cost)}</p>
              )}
            </CardContent>
          </Card>
        )}

        {showProfit && (
          <Card className={`pt-2 pb-2 col-span-2 ${isProfit ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:bg-red-950/20"}`}>
            <CardContent className="pl-3.5 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Ganancia neta</span>
                <TrendingUp className={`size-3.5 shrink-0 ${isProfit ? "text-green-600" : "text-red-500"}`} />
              </div>
              <p className={`text-lg font-bold truncate ${isProfit ? "text-green-600" : "text-red-500"}`}>
                {format(summary.net_profit ?? 0)}
              </p>
              <p className={`text-[10px] ${isProfit ? "text-green-600" : "text-red-500"}`}>
                ROI {(summary.roi ?? 0).toFixed(1)}%
                {summary.total_tax > 0 && ` · ISV ${format(summary.total_tax)}`}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Desglose financiero ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="size-4" />
            Desglose financiero
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ventas brutas</span>
            <span className="font-medium">{format(summary.total_sales)}</span>
          </div>
          {Object.entries(summary.by_account ?? {}).map(([accountName, amount]) => (
            <div key={accountName} className="flex justify-between text-xs text-muted-foreground pl-4">
              <span>{accountName}</span>
              <span>{format(amount as number)}</span>
            </div>
          ))}
          {summary.total_tax > 0 && (
            <div className="flex justify-between text-amber-600">
              <span>ISV incluido (pagado al SAR)</span>
              <span>-{format(summary.total_tax)}</span>
            </div>
          )}
          {showProfit && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ganancia de ventas</span>
              <span className="font-medium text-green-600">{format(summary.total_profit ?? 0)}</span>
            </div>
          )}

          {showProfit && (
            <>
              <Separator />

              {event.fixed_cost > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Costo fijo del evento</span>
                  <span>-{format(event.fixed_cost)}</span>
                </div>
              )}
              {extraExpenses > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Gastos adicionales</span>
                  <span>-{format(extraExpenses)}</span>
                </div>
              )}

              <Separator />

              <div className={`flex justify-between font-bold text-base ${isProfit ? "text-green-600" : "text-red-500"}`}>
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="size-4" />
                  Ganancia neta
                </span>
                <span>{format(summary.net_profit ?? 0)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

 {/* ── Gastos adicionales ── */}
      {showProfit && event.expenses.length > 0 && (
        <Card className="border-red-200 dark:border-red-800/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
              <TrendingDown className="size-4" />
              Gastos adicionales
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {event.expenses.map((expense) => (
              <div key={expense.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-red-50/50 dark:bg-red-950/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{expense.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(expense.occurred_at)}</p>
                </div>
                <p className="text-sm font-semibold text-red-600 shrink-0">
                  -{format(expense.amount ?? 0)}
                </p>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1 border-t border-red-200/60">
              <span className="text-xs text-red-600">Total gastos adicionales</span>
              <span className="text-sm font-bold text-red-600">-{format(extraExpenses)}</span>
            </div>
          </CardContent>
        </Card>
      )}
      {/* ── Ventas ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="size-4" />
            Ventas del evento
            <Badge variant="secondary" className="ml-auto">{summary.sales_count}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {event.sales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aún no hay ventas registradas para este evento.{" "}
              <Link href={`/sales/new?event_id=${event.id}`} className="text-primary underline underline-offset-2">
                Registrar primera venta
              </Link>
            </p>
          ) : (
            <>
              {pagedSales.map((sale) => {
                const PayIcon = PAYMENT_CONFIG[sale.payment_method]?.icon ?? HelpCircle;
                return (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-sm font-semibold">{sale.sale_number}</span>
                        {sale.tax_rate > 0 && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                            ISV {sale.tax_rate}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {sale.customer_name ?? "Anónimo"} · {formatDate(sale.sold_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{format(sale.total)}</p>
                      {showProfit && <p className="text-xs text-green-600">+{format(sale.profit ?? 0)}</p>}
                    </div>
                    <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                      <PayIcon className="size-3" />
                      {sale.items_count} prod.
                    </Badge>
                  </Link>
                );
              })}
              <PaginationControls
                page={effectiveSalesPage}
                totalPages={totalSalesPages}
                total={sortedSales.length}
                label="ventas"
                onPageChange={setSalesPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Notas ── */}
      {event.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Notas</p>
            <p className="text-sm">{event.notes}</p>
          </CardContent>
        </Card>
      )}

      {(() => {
        const fabActions: FabAction[] = [
          ...(event.status !== "COMPLETED" && salesCanEdit ? [{
            label:   "Nueva venta",
            icon:    ShoppingCart,
            onClick: () => push(`/sales/new?event_id=${event.id}`),
          }] : []),
          ...(canEdit ? [{
            label:   "Agregar gasto",
            icon:    Receipt,
            onClick: () => setExpenseOpen(true),
          }] : []),
          ...(canEdit ? [{
            label:   "Editar evento",
            icon:    Pencil,
            onClick: () => setEditOpen(true),
          }] : []),
        ];
        return fabActions.length > 0 ? <Fab actions={fabActions} /> : null;
      })()}

      <EditEventDialog
        event={event}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => { setEditOpen(false); mutate(); }}
      />

      <AddExpenseDialog
        event={event}
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        onSuccess={() => { setExpenseOpen(false); mutate(); }}
      />

    </div>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}