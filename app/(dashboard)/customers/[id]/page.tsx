// app/(dashboard)/customers/[id]/page.tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Mail, Phone, Calendar, ShoppingCart, TrendingUp,
  Banknote, Star, Pencil, Trash2, Clock, Users, Package,
} from "lucide-react";
import {
  useCustomerSummary, useLoyaltyPolicies, computeLoyaltyTier,
  TIER_COLOR_CLASSES, type RecentSale,
} from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { DeleteCustomerDialog } from "@/components/customers/delete-customer-dialog";

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
          <h1 className="text-2xl font-semibold tracking-tight leading-tight truncate">{summary.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {summary.email && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="size-3" /> {summary.email}
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
        <div className="flex items-center gap-2 shrink-0">
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ShoppingCart className="size-3.5 text-primary" /> Órdenes
            </p>
            <p className="text-xl font-bold">{summary.total_orders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="size-3.5 text-green-600" /> Total gastado
            </p>
            <p className="text-xl font-bold">{format(Number(summary.total_spent))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Banknote className="size-3.5 text-amber-600" /> Ticket promedio
            </p>
            <p className="text-xl font-bold">{format(Number(summary.avg_order_value))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Clock className="size-3.5 text-muted-foreground" /> Última compra
            </p>
            <p className="text-xl font-bold">
              {summary.last_purchase_at
                ? new Date(summary.last_purchase_at).toLocaleDateString("es-HN", dateOpts)
                : "—"}
            </p>
            {!summary.last_purchase_at && (
              <p className="text-xs text-muted-foreground mt-0.5">sin compras</p>
            )}
          </CardContent>
        </Card>
      </div>

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
          Compras recientes
        </p>
        {recentSales.length > 0 ? (
          <div className="space-y-2">
            {recentSales.map((sale) => (
              <Tooltip key={sale.id}>
                <TooltipTrigger asChild>
                  <Card
                    className="cursor-pointer hover:bg-muted/30 hover:border-primary/30 transition-colors"
                    onClick={() => push(`/sales/${sale.id}`)}
                  >
                    <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{sale.sale_number}</p>
                        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {new Date(sale.sold_at).toLocaleDateString("es-HN", dateOpts)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn("border text-xs", STATUS_COLOR[sale.status] ?? "")}>
                          {STATUS_LABEL[sale.status] ?? sale.status}
                        </Badge>
                        <span className="text-sm font-semibold">{format(Number(sale.total))}</span>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-72 text-left">
                  <SaleItemsTooltip sale={sale} />
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
