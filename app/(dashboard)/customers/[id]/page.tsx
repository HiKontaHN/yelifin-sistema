// app/(dashboard)/customers/[id]/page.tsx
"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SummaryStats } from "@/components/shared/summary-stats";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Mail, Phone, Calendar, ShoppingCart, TrendingUp,
  Banknote, Star, Pencil, Trash2, Clock, Users, Package, MoreHorizontal,
} from "lucide-react";
import {
  useCustomerSummary, useLoyaltyPolicies, computeLoyaltyTier,
  TIER_COLOR_CLASSES, type RecentSale,
} from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { DeleteCustomerDialog } from "@/components/customers/delete-customer-dialog";
import { useTimezone } from "@/hooks/swr/use-timezone";

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
  PENDING:   "bg-amber-100 text-amber-700 border-amber-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completada",
  PENDING:   "Pendiente",
  CANCELLED: "Cancelada",
};

type Props = { params: Promise<{ id: string }> };

export default function CustomerDetailPage({ params }: Props) {
  const { id }         = use(params);
  const numericId      = Number(id);
  const { push, back } = useRouter();
  const timezone = useTimezone();
  const dateKeyFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }), [timezone]);
  const dateTitleFormatter = useMemo(() => new Intl.DateTimeFormat("es-HN", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "2-digit",
  }), [timezone]);

  const { customer: summary, recentSales, isLoading, error, mutate } = useCustomerSummary(numericId);
  const { policies } = useLoyaltyPolicies();
  const { format }   = useCurrency();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("CUSTOMERS");

  const [editOpen,   setEditOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <CustomerDetailSkeleton />;

  if (error || !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Users className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">{error ?? "Cliente no encontrado"}</p>
        <Button variant="outline" asChild>
          <Link href="/customers">Volver a clientes</Link>
        </Button>
      </div>
    );
  }

  const tier       = computeLoyaltyTier(summary, policies);
  const tierColors = tier ? (TIER_COLOR_CLASSES[tier.color] ?? TIER_COLOR_CLASSES.amber) : null;

  const dateOpts: Intl.DateTimeFormatOptions = {
    day: "numeric", month: "short", year: "numeric",
  };
  const saleColumns: DataTableTimeSectionColumn<RecentSale>[] = [
    {
      id: "sale", header: "Número", width: "clamp(8rem, 20vw, 12rem)",
      cell: (sale) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="block w-fit cursor-help font-mono font-medium">{sale.sale_number}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-left"><SaleItemsTooltip sale={sale} /></TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "status", header: "Estado", width: 130,
      cell: (sale) => <Badge className={cn("border text-xs", STATUS_COLOR[sale.status] ?? "")}>{STATUS_LABEL[sale.status] ?? sale.status}</Badge>,
    },
    {
      id: "products", header: "Productos", width: 150,
      cell: (sale) => <Badge variant="secondary">{sale.items_count} producto{sale.items_count !== 1 ? "s" : ""} · {sale.total_quantity} un.</Badge>,
    },
    {
      id: "total", header: "Total", width: 120, align: "right",
      className: "font-semibold tabular-nums",
      cell: (sale) => format(Number(sale.total)),
    },
  ];
  const renderSaleDate = (_key: string, rows: readonly RecentSale[]) => {
    const parts = dateTitleFormatter.formatToParts(new Date(rows[0].sold_at));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
    const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("es-HN") + value.slice(1);
    return `${capitalize(part("weekday"))} ${part("day")} de ${capitalize(part("month"))} del ${part("year")}`;
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto mb-8">

      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => back()}>
          <ArrowLeft className="size-4" />
        </Button>

        {/* Avatar */}
        <div className="relative size-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
          <Users className="size-7 text-muted-foreground/40" />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight leading-tight whitespace-normal break-words">{summary.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {summary.email && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="size-3 shrink-0" /> <span className="break-all">{summary.email}</span>
              </span>
            )}
            {summary.phone && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="size-3" /> {summary.phone}
              </span>
            )}
            {tier && tierColors && (
              <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border", tierColors.bg, tierColors.text, tierColors.border)}>
                <Star className="size-3" /> {tier.tier_name}
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="hidden items-center gap-2 shrink-0 sm:flex">
          {canEdit && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Eliminar</span>
            </Button>
          )}
        </div>
        {(canEdit || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 shrink-0 sm:hidden" aria-label="Acciones del cliente">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {canEdit && (
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil /> Editar
                </DropdownMenuItem>
              )}
              {canEdit && canDelete && <DropdownMenuSeparator />}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Stats */}
      <SummaryStats
        ariaLabel={`Resumen de ${summary.name}`}
        columns="auto"
        items={[
          { label: "Órdenes", icon: ShoppingCart, value: summary.total_orders },
          { label: "Total gastado", icon: TrendingUp, value: format(Number(summary.total_spent)), valueClassName: "text-green-600 dark:text-green-400" },
          { label: "Ticket promedio", icon: Banknote, value: format(Number(summary.avg_order_value)) },
          { label: "Última compra", icon: Clock, value: summary.last_purchase_at ? new Date(summary.last_purchase_at).toLocaleDateString("es-HN", dateOpts) : "—", detail: !summary.last_purchase_at ? "sin compras" : undefined },
        ]}
      />

      {/* Nivel de fidelización */}
      {tier && tierColors && (
        <div className={cn("rounded-xl border px-4 py-3 flex items-center gap-3", tierColors.border, tierColors.bg)}>
          <Star className={cn("size-5 shrink-0", tierColors.text)} />
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-semibold", tierColors.text)}>
              Cliente {tier.tier_name} · {tier.discount_pct}% descuento
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tier.min_orders != null && `${tier.min_orders} órdenes mínimo`}
              {tier.min_orders != null && tier.min_spent != null && " · "}
              {tier.min_spent  != null && `${format(Number(tier.min_spent))} mínimo en compras`}
            </p>
          </div>
        </div>
      )}

      {/* Compras recientes */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Ventas recientes
        </p>
        {recentSales.length > 0 ? (
          <DataTableTimeSection
            columns={saleColumns}
            data={recentSales}
            getRowKey={(sale) => sale.id}
            getGroupKey={(sale) => dateKeyFormatter.format(new Date(sale.sold_at))}
            renderGroupHeader={renderSaleDate}
            renderMobileRow={(sale) => (
              <Card
                key={sale.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer transition-colors hover:border-primary/30 hover:bg-muted/30"
                onClick={() => push(`/sales/${sale.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    push(`/sales/${sale.id}`);
                  }
                }}
              >
                <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="block w-fit font-mono text-sm font-medium">{sale.sale_number}</span></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-72 text-left"><SaleItemsTooltip sale={sale} /></TooltipContent>
                    </Tooltip>
                    <p className="text-xs text-muted-foreground">{sale.items_count} producto{sale.items_count !== 1 ? "s" : ""} · {sale.total_quantity} un.</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className={cn("border text-xs", STATUS_COLOR[sale.status] ?? "")}>{STATUS_LABEL[sale.status] ?? sale.status}</Badge>
                    <span className="text-sm font-semibold">{format(Number(sale.total))}</span>
                  </div>
                </CardContent>
              </Card>
            )}
            onRowClick={(sale) => push(`/sales/${sale.id}`)}
            recordLabel="ventas recientes"
            ariaLabel="Ventas recientes del cliente"
            minWidth={520}
            stickyOffset="var(--data-table-sticky-offset)"
            className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
            showFooterPagination={false}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <ShoppingCart className="size-8 text-muted-foreground/40" />
              <p className="text-sm">Sin ventas registradas</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notas */}
      {summary.notes && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Notas
          </p>
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl px-3.5 py-2.5">
            {summary.notes}
          </p>
        </div>
      )}

      {/* Registro */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="size-3" />
        Cliente desde{" "}
        <span suppressHydrationWarning>
          {new Date(summary.created_at).toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>

      <EditCustomerDialog
        customer={summary}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => mutate()}
      />
      <DeleteCustomerDialog
        customer={summary}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onSuccess={() => push("/customers")}
      />
    </div>
  );
}

// ── Tooltip de detalle de venta ─────────────────────────────────────────

const MAX_TOOLTIP_ITEMS = 5;

function SaleItemsTooltip({ sale }: { sale: RecentSale }) {
  if (sale.items.length === 0) {
    return <p>Sin productos registrados</p>;
  }

  const shown  = sale.items.slice(0, MAX_TOOLTIP_ITEMS);
  const rest   = sale.items.length - shown.length;

  return (
    <div className="space-y-1">
      <p className="font-semibold flex items-center gap-1">
        <Package className="size-3" />
        {sale.items_count} producto{sale.items_count !== 1 ? "s" : ""} · {sale.total_quantity} unidad{sale.total_quantity !== 1 ? "es" : ""}
      </p>
      <ul className="space-y-0.5">
        {shown.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="truncate">{item.product_name}</span>
            <span className="opacity-80 shrink-0">×{item.quantity}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="opacity-70">+{rest} más</p>}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────

function CustomerDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="size-16 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <SummaryStats
        ariaLabel="Cargando resumen del cliente"
        isLoading
        items={[
          { label: "Órdenes", icon: ShoppingCart, value: "" },
          { label: "Total gastado", icon: TrendingUp, value: "" },
          { label: "Ticket promedio", icon: Banknote, value: "" },
          { label: "Última compra", icon: Clock, value: "" },
        ]}
      />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
