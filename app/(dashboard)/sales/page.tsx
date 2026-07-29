"use client";

import { useState, useEffect } from "react";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useRouter } from "next/navigation";

import { Fab } from "@/components/ui/fab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Receipt, Banknote, CreditCard, ArrowLeftRight,
  TrendingUp, DollarSign, ShoppingCart, HelpCircle, X,
  CheckCircle, XCircle, Clock, Pencil, MoreVertical, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { useSales, usePatchSale, useDeleteSale, Sale } from "@/hooks/swr/use-sales";
import { useDebounce } from "@/hooks/use-debounce";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useModulePermissions } from "@/hooks/use-module-permissions";

// ── Utils ──────────────────────────────────────────────────────────────
const formatDateOnly = (dateString: string) =>
  new Date(dateString).toLocaleDateString("es-HN", {
    year: "numeric", month: "short", day: "numeric",
  });

type Preset        = "today" | "7d" | "this_month" | "last_month" | "all";
type PaymentFilter = "all" | "CASH" | "CARD" | "TRANSFER" | "MIXED" | "OTHER";
type StatusFilter  = "all" | "COMPLETED" | "PENDING";

const paymentConfig: Record<string, { label: string; icon: any }> = {
  CASH:     { label: "Efectivo",      icon: Banknote      },
  CARD:     { label: "Tarjeta",       icon: CreditCard    },
  TRANSFER: { label: "Transferencia", icon: ArrowLeftRight },
  MIXED:    { label: "Mixto",         icon: HelpCircle    },
  OTHER:    { label: "Otro",          icon: HelpCircle    },
};

const PRESET_LABELS: Record<Preset, string> = {
  today:      "Hoy",
  "7d":       "Últimos 7 días",
  this_month: "Este mes",
  last_month: "Mes pasado",
  all:        "Todas",
};

const getTaxRate = (v: any): number => Number(v) || 0;

// ── Acciones para venta PENDIENTE ─────────────────────────────────────
function PendingActions({ saleId, onMutate, canEdit }: { saleId: number; onMutate: () => void; canEdit: boolean }) {
  const { push } = useRouter();
  const { confirmSale, cancelSale, isPatching } = usePatchSale(saleId);
  if (!canEdit) return null;

  const handleConfirm = async () => {
    try {
      await confirmSale();
      toast.success("Venta confirmada");
      onMutate();
    } catch (err: any) {
      toast.error(err.message || "Error al confirmar");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelSale();
      toast.success("Venta cancelada · stock devuelto");
      onMutate();
    } catch (err: any) {
      toast.error(err.message || "Error al cancelar");
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled={isPatching}>
            {isPatching
              ? <Clock className="size-4 animate-spin text-muted-foreground" />
              : <MoreVertical className="size-4" />
            }
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => push(`/sales/${saleId}/edit`)}>
            <Pencil className="size-4 mr-2" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-green-600 focus:text-green-700 focus:bg-green-50"
            onClick={handleConfirm}
          >
            <CheckCircle className="size-4 mr-2" /> Confirmar pago
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            onClick={handleCancel}
          >
            <XCircle className="size-4 mr-2" /> Cancelar venta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Acciones para venta COMPLETADA ────────────────────────────────────
function CompletedActions({
  sale,
  onDeleteRequest,
  canDelete,
}: {
  sale: Sale;
  onDeleteRequest: (sale: Sale) => void;
  canDelete: boolean;
}) {
  const { push } = useRouter();
  if (!canDelete) return null;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => push(`/sales/${sale.id}`)}>
            <Search className="size-4 mr-2" /> Ver detalle
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            onClick={() => onDeleteRequest(sale)}
          >
            <Trash2 className="size-4 mr-2" /> Anular venta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { push }   = useRouter();
  const { format } = useCurrency();
  const { show_profit: showProfit, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("SALES");

  const [preset,         setPreset]         = useState<Preset>("7d");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [paymentFilter,  setPaymentFilter]  = useState<PaymentFilter>("all");
  const [accountFilter,  setAccountFilter]  = useState<string>("all");
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>("all");
  const [page,           setPage]           = useState(1);
  const pageLimit = 15;

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [
    debouncedSearch, statusFilter, accountFilter,
    paymentFilter, preset, dateFrom, dateTo,
  ]);

  // Delete
  const [deletingSale,   setDeletingSale]   = useState<Sale | null>(null);
  const { deleteSale,    isDeleting }       = useDeleteSale();

  const { sales, stats, total, totalPages, isLoading, mutate } = useSales({
    preset,
    from:       dateFrom    || undefined,
    to:         dateTo      || undefined,
    payment:    paymentFilter,
    search:     debouncedSearch || undefined,
    status:     statusFilter !== "all" ? statusFilter : undefined,
    account_id: accountFilter !== "all" ? accountFilter : undefined,
    page,
    limit:      pageLimit,
  });

  const { accounts } = useAccounts();

  const hasFilters   = dateFrom || dateTo || paymentFilter !== "all" || accountFilter !== "all" || statusFilter !== "all" || search;
  const clearAll     = () => { setDateFrom(""); setDateTo(""); setSearch(""); setPaymentFilter("all"); setAccountFilter("all"); setStatusFilter("all"); setPreset("this_month"); setPage(1); };
  const onChangePreset = (v: Preset) => { setPreset(v); setDateFrom(""); setDateTo(""); };
  const onManualFrom   = (v: string)  => { setDateFrom(v); setPreset("all"); };
  const onManualTo     = (v: string)  => { setDateTo(v);   setPreset("all"); };

  const activePeriodLabel = dateFrom || dateTo
    ? [dateFrom && `Desde ${formatDateOnly(dateFrom)}`, dateTo && `Hasta ${formatDateOnly(dateTo)}`].filter(Boolean).join(" · ")
    : PRESET_LABELS[preset];

  const handleDeleteConfirm = async () => {
    if (!deletingSale) return;
    try {
      await deleteSale(deletingSale.id);
      toast.success("Venta anulada · inventario y balance revertidos");
      setDeletingSale(null);
    } catch (err: any) {
      toast.error(err.message || "Error al anular la venta");
    }
  };

  return (
    <div className="space-y-4 pb-24">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {activePeriodLabel}
            {stats.pending_count > 0 && (
              <span className="ml-1.5 text-amber-600 font-medium">
                · {stats.pending_count} pendiente{stats.pending_count !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0 sm:hidden">
          {isLoading
            ? <Skeleton className="h-8 w-10 ml-auto" />
            : <p className="text-3xl font-bold">{total}</p>
          }
          <p className="text-xs text-muted-foreground">registros</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Card className="hidden sm:block pt-1 pb-1">
          <CardContent className="pl-3.5 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Ventas</span>
              <ShoppingCart className="size-3.5 text-muted-foreground shrink-0" />
            </div>
            {isLoading ? <Skeleton className="h-6 w-12" /> : (
              <div className="flex items-baseline gap-1.5">
                <p className="text-lg font-bold">{stats.completed_count}</p>
                {stats.pending_count > 0 && <span className="text-xs text-amber-600">{stats.pending_count} pend.</span>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="pt-2 pb-2">
          <CardContent className="pl-3.5 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Ingresos</span>
              <DollarSign className="size-3.5 text-muted-foreground shrink-0" />
            </div>
            {isLoading
              ? <Skeleton className="h-6 w-20" />
              : <p className="text-base font-bold sm:text-lg truncate">{format(stats.total_revenue)}</p>
            }
          </CardContent>
        </Card>
        {showProfit && (
          <Card className="pt-2 pb-2">
            <CardContent className="pl-3.5 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Ganancia</span>
                <TrendingUp className="size-3.5 text-muted-foreground shrink-0" />
              </div>
              {isLoading ? <Skeleton className="h-6 w-20" /> : (
                <div className="flex items-baseline gap-1.5">
                  <p className="text-base font-bold text-green-600 sm:text-lg truncate">{format(stats.total_profit)}</p>
                  {stats.total_revenue > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {((stats.total_profit / stats.total_revenue) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchBar
              value={search}
              onChange={setSearch}
              size="full"
              placeholder="Buscar por número, cliente o notas..."
            />
          </div>
          <div className="w-[38%] shrink-0">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent position="popper" className="w-[--radix-select-trigger-width] min-w-0">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="COMPLETED">Completadas</SelectItem>
                <SelectItem value="PENDING">Pendientes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={preset} onValueChange={(v) => onChangePreset(v as Preset)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" className="w-[--radix-select-trigger-width] min-w-0">
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="this_month">Este mes</SelectItem>
              <SelectItem value="last_month">Mes pasado</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Cuenta" /></SelectTrigger>
            <SelectContent position="popper" className="w-[--radix-select-trigger-width] min-w-0">
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => onManualFrom(e.target.value)} className="text-sm" />
          <Input type="date" value={dateTo}   onChange={(e) => onManualTo(e.target.value)}   className="text-sm" />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground w-full" onClick={clearAll}>
            <X className="size-3.5" /> Limpiar filtros
          </Button>
        )}
      </div>

      {/* Cards móvil */}
      <div className="space-y-2 lg:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />) /* skeleton - index key ok */
        ) : sales.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Receipt className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No se encontraron ventas</p>
            </CardContent>
          </Card>
        ) : (
          sales.map((sale) => {
            const payment   = paymentConfig[sale.payment_method] ?? paymentConfig.OTHER;
            const PayIcon   = payment.icon;
            const taxRate   = getTaxRate(sale.tax_rate);
            const isPending = sale.status === "PENDING";
            return (
              <Card
                key={sale.id}
                className={`pt-1 pb-1 cursor-pointer active:scale-[0.99] transition-transform ${isPending ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                onClick={() => push(`/sales/${sale.id}`)}
              >
                <CardContent className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-mono text-sm font-semibold">{sale.sale_number}</p>
                        {isPending && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200 gap-1" variant="outline">
                            <Clock className="size-2.5" /> Pendiente
                          </Badge>
                        )}
                        {taxRate > 0 && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                            ISV {taxRate}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {sale.customer_name ?? "Anónimo"} · {formatDateOnly(sale.sold_at)}
                      </p>
                    </div>
                    {isPending
                      ? <PendingActions saleId={sale.id} onMutate={mutate} canEdit={canEdit} />
                      : (
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="gap-1 text-xs">
                            <PayIcon className="size-3" /> {(sale as any).account_name}
                          </Badge>
                          <CompletedActions sale={sale} onDeleteRequest={setDeletingSale} canDelete={canDelete} />
                        </div>
                      )
                    }
                  </div>
                  <div className={`grid gap-1 pt-2 border-t text-center ${(!isPending && showProfit) ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Productos</p>
                      <p className="text-sm font-semibold">{sale.items_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Total</p>
                      <p className="text-sm font-bold truncate">{format(Number(sale.total))}</p>
                    </div>
                    {!isPending && showProfit && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Ganancia</p>
                        <p className="text-sm font-bold text-green-600 truncate">
                          {format(Number(sale.net_profit - sale.discount))}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Tabla desktop */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">ISV</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {showProfit && <TableHead className="text-right">Ganancia</TableHead>}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                /* skeleton - index key ok */
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: showProfit ? 11 : 10 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showProfit ? 11 : 10} className="text-center py-12 text-muted-foreground">
                    Aún no se han registrado ventas en este período
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => {
                  const payment   = paymentConfig[sale.payment_method] ?? paymentConfig.OTHER;
                  const PayIcon   = payment.icon;
                  const taxRate   = getTaxRate(sale.tax_rate);
                  const isPending = sale.status === "PENDING";
                  return (
                    <TableRow
                      key={sale.id}
                      className={`cursor-pointer hover:bg-muted/50 ${isPending ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                      onClick={() => push(`/sales/${sale.id}`)}
                    >
                      <TableCell className="font-medium font-mono">{sale.sale_number}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateOnly(sale.sold_at)}</TableCell>
                      <TableCell>{sale.customer_name ?? <span className="text-muted-foreground">Anónimo</span>}</TableCell>
                      <TableCell>
                        {isPending ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1" variant="outline">
                            <Clock className="size-3" /> Pendiente
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-green-200 gap-1" variant="outline">
                            <CheckCircle className="size-3" /> Completada
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {sale.items_count} {sale.items_count === 1 ? "producto" : "productos"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <PayIcon className="size-3" /> {payment.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(sale as any).account_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {taxRate > 0
                          ? <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline">{taxRate}%</Badge>
                          : <span className="text-muted-foreground text-sm">—</span>
                        }
                      </TableCell>
                      <TableCell className="text-right font-medium">{format(Number(sale.total))}</TableCell>
                      {showProfit && (
                        <TableCell className="text-right">
                          {isPending
                            ? <span className="text-muted-foreground text-xs">—</span>
                            : <span className="text-green-600 font-medium">{format(Number(sale.net_profit - sale.discount))}</span>
                          }
                        </TableCell>
                      )}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isPending
                          ? <PendingActions saleId={sale.id} onMutate={mutate} canEdit={canEdit} />
                          : <CompletedActions sale={sale} onDeleteRequest={setDeletingSale} canDelete={canDelete} />
                        }
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground order-2 sm:order-1">
            {total} venta{total !== 1 ? "s" : ""} · página {page} de {totalPages}
          </p>
          <Pagination className="order-1 sm:order-2 w-auto mx-0 justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) =>
                  p === 1 || p === totalPages ||
                  (p >= page - 1 && p <= page + 1)
                )
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === page}
                        onClick={() => setPage(p as number)}
                        className="cursor-pointer"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <Fab actions={[{ label: "Nueva venta", icon: ShoppingCart, onClick: () => push("/sales/new") }]} />

      {/* Confirm anular venta completada */}
      <ConfirmDialog
        open={!!deletingSale}
        onOpenChange={(v) => { if (!v) setDeletingSale(null); }}
        title={`¿Anular ${deletingSale?.sale_number ?? "esta venta"}?`}
        description="Se revertirá el inventario, el balance de la cuenta y los totales del cliente. Esta acción no se puede deshacer."
        confirmLabel={isDeleting ? "Anulando..." : "Anular venta"}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

    </div>
  );
}