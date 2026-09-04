// components/customers/customer-summary-sheet.tsx
"use client";

import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { DialogTitle } from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Mail, Phone, Calendar, ShoppingCart, TrendingUp,
  Banknote, Star, Pencil, Trash2, Clock,
} from "lucide-react";
import {
  useCustomerSummary, useLoyaltyPolicies, computeLoyaltyTier,
  TIER_COLOR_CLASSES,
  type Customer,
} from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";

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

type Props = {
  customer:     Customer | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onEdit:       (customer: Customer) => void;
  onDelete:     (customer: Customer) => void;
};

export function CustomerSummarySheet({ customer, open, onOpenChange, onEdit, onDelete }: Props) {
  const { customer: summary, recentSales, isLoading } = useCustomerSummary(open && customer ? customer.id : null);
  const { policies } = useLoyaltyPolicies();
  const { format }   = useCurrency();

  const tier = summary ? computeLoyaltyTier(summary, policies) : null;
  const tierColors = tier ? (TIER_COLOR_CLASSES[tier.color] ?? TIER_COLOR_CLASSES.amber) : null;

  if (!customer) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      preventOutsideClose={false}
      width="xl"
      height="tall"
      bodyClassName="space-y-5"
      header={
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold truncate">{customer.name}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {customer.email && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="size-3" /> {customer.email}
                </span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3" /> {customer.phone}
                </span>
              )}
            </div>
          </div>
          {tier && tierColors && (
            <span className={cn("shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border", tierColors.bg, tierColors.text, tierColors.border)}>
              <Star className="size-3" /> {tier.tier_name}
            </span>
          )}
        </div>
      }
      footer={
        <>
          <Button
            variant="outline"
            className="flex-1 gap-2 text-destructive hover:text-destructive"
            onClick={() => { onOpenChange(false); onDelete(customer); }}
          >
            <Trash2 className="size-4" /> Eliminar
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => { onOpenChange(false); onEdit(customer); }}
          >
            <Pencil className="size-4" /> Editar
          </Button>
        </>
      }
    >
          {isLoading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
              <Skeleton className="h-32 rounded-xl" />
            </div>
          ) : summary ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={<ShoppingCart className="size-3.5 text-primary" />}
                  label="Órdenes"
                  value={String(summary.total_orders)}
                />
                <StatCard
                  icon={<TrendingUp className="size-3.5 text-green-600" />}
                  label="Total gastado"
                  value={format(Number(summary.total_spent))}
                />
                <StatCard
                  icon={<Banknote className="size-3.5 text-amber-600" />}
                  label="Ticket promedio"
                  value={format(Number(summary.avg_order_value))}
                />
                <StatCard
                  icon={<Clock className="size-3.5 text-muted-foreground" />}
                  label="Última compra"
                  value={summary.last_purchase_at
                    ? new Date(summary.last_purchase_at).toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })
                    : "Sin compras"}
                />
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
              {recentSales.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Compras recientes
                  </p>
                  <div className="rounded-xl border overflow-hidden divide-y">
                    {recentSales.map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/30 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{sale.sale_number}</p>
                          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                            {new Date(sale.sold_at).toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={cn("border text-xs", STATUS_COLOR[sale.status] ?? "")}>
                            {STATUS_LABEL[sale.status] ?? sale.status}
                          </Badge>
                          <span className="text-sm font-semibold">{format(Number(sale.total))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                Cliente desde <span suppressHydrationWarning>{new Date(summary.created_at).toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            </>
          ) : null}
    </ResponsiveModal>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-bold leading-tight break-all" suppressHydrationWarning>{value}</p>
    </div>
  );
}
