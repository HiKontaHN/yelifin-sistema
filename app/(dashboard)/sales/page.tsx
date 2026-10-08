"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTimezone } from "@/hooks/swr/use-timezone";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Fab } from "@/components/ui/fab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryStats } from "@/components/shared/summary-stats";
import {
  DataTableTimeSection, DATA_TABLE_PAGE_SIZE_OPTIONS, DEFAULT_DATA_TABLE_PAGE_SIZE,
  type DataTableTimeSectionColumn,
} from "@/components/shared/data-table-time-section";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Receipt, Banknote, CreditCard, ArrowLeftRight,
  TrendingUp, Wallet, ShoppingCart, HelpCircle, X,
  CheckCircle, XCircle, Clock, Pencil, MoreVertical, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar";
import {
  DateRangePicker,
  DEFAULT_DATE_RANGE_PRESETS,
  type DateRangePreset,
  type DateRangeValue,
} from "@/components/shared/date-range-picker";
import { CancelSaleDialog } from "@/components/sales/cancel-sale-dialog";

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
type StatusFilter  = "all" | "COMPLETED" | "PENDING" | "CANCELLED";

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

const toDateInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const salesPresetRange = (preset: Preset, today = new Date()): DateRangeValue => {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === "all") return { from: "", to: "" };
  if (preset === "today") {
    const value = toDateInput(day);
    return { from: value, to: value };
  }
  if (preset === "7d") {
    const from = new Date(day);
    from.setDate(from.getDate() - 6);
    return { from: toDateInput(from), to: toDateInput(day) };
  }
  if (preset === "last_month") {
    return {
      from: toDateInput(new Date(day.getFullYear(), day.getMonth() - 1, 1)),
      to: toDateInput(new Date(day.getFullYear(), day.getMonth(), 0)),
    };
  }
  return {
    from: toDateInput(new Date(day.getFullYear(), day.getMonth(), 1)),
    to: toDateInput(new Date(day.getFullYear(), day.getMonth() + 1, 0)),
  };
};

const thisMonthPresetIndex = DEFAULT_DATE_RANGE_PRESETS.findIndex(
  (preset) => preset.id === "this-month",
);
const SALES_DATE_PRESETS: DateRangePreset[] = [
  ...DEFAULT_DATE_RANGE_PRESETS.slice(0, thisMonthPresetIndex + 1),
  {
    id: "last-month",
    label: "Mes pasado",
    getRange: (today) => salesPresetRange("last_month", today),
  },
  ...DEFAULT_DATE_RANGE_PRESETS.slice(thisMonthPresetIndex + 1),
  {
    id: "all",
    label: "Todas",
    getRange: () => salesPresetRange("all"),
  },
];

const getTaxRate = (v: any): number => Number(v) || 0;

// ── Acciones para venta PENDIENTE ─────────────────────────────────────
function PendingActions({ saleId, onMutate, canEdit }: { saleId: number; onMutate: () => void; canEdit: boolean }) {
  const { push } = useRouter();
  const { confirmSale, cancelSale, isPatching } = usePatchSale(saleId);
  const [cancelOpen, setCancelOpen] = useState(false);
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

  const handleCancel = async (reason?: string) => {
    try {
      await cancelSale(reason);
      toast.success("Venta cancelada · stock devuelto");
      setCancelOpen(false);
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
            onClick={() => setCancelOpen(true)}
          >
            <XCircle className="size-4 mr-2" /> Cancelar venta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CancelSaleDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar esta venta"
        description="Se devolverá el stock al inventario y la venta quedará marcada como cancelada."
        isLoading={isPatching}
        onConfirm={handleCancel}
      />
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
// Lee un filtro de la URL validándolo contra los valores permitidos —
// evita que un query string manipulado a mano meta un valor que ningún
// <Select> sepa renderizar.
function readEnumParam<T extends string>(
  searchParams: URLSearchParams, key: string, allowed: readonly T[], fallback: T
): T {
  const v = searchParams.get(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const PRESETS: readonly Preset[] = ["today", "7d", "this_month", "last_month", "all"];
const PAYMENT_FILTERS: readonly PaymentFilter[] = ["all", "CASH", "CARD", "TRANSFER", "MIXED", "OTHER"];
const STATUS_FILTERS: readonly StatusFilter[] = ["all", "COMPLETED", "PENDING", "CANCELLED"];

export default function SalesPage() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { format } = useCurrency();
  const timezone = useTimezone();
  const dateKeyFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }), [timezone]);
  const dateTitleFormatter = useMemo(() => new Intl.DateTimeFormat("es-HN", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "2-digit",
  }), [timezone]);
  const { show_profit: showProfit, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("SALES");

  // Filtros restaurados desde la URL — así, al volver del detalle de una
  // venta (que ahora usa router.back()), el historial trae de vuelta esta
  // misma URL con los filtros ya aplicados.
  const [preset,         setPreset]         = useState<Preset>(() => readEnumParam(searchParams, "preset", PRESETS, "7d"));
  const [dateFrom,       setDateFrom]       = useState(() => searchParams.get("from") ?? "");
  const [dateTo,         setDateTo]         = useState(() => searchParams.get("to") ?? "");
  const [paymentFilter,  setPaymentFilter]  = useState<PaymentFilter>(() => readEnumParam(searchParams, "payment", PAYMENT_FILTERS, "all"));
  const [accountFilter,  setAccountFilter]  = useState<string>(() => searchParams.get("account") ?? "all");
  const [search,         setSearch]         = useState(() => searchParams.get("q") ?? "");
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>(() => readEnumParam(searchParams, "status", STATUS_FILTERS, "all"));
  const [page,           setPage]           = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isInteger(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize"));
    return DATA_TABLE_PAGE_SIZE_OPTIONS.some((size) => size === value) ? value : DEFAULT_DATA_TABLE_PAGE_SIZE;
  });

  const debouncedSearch = useDebounce(search, 300);

  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    setPage(1);
  }, [
    debouncedSearch, statusFilter, accountFilter,
    paymentFilter, preset, dateFrom, dateTo,
  ]);

  // Reflejar los filtros en la URL (replace, no push, para no ensuciar el
  // historial) — permite que "volver" desde /sales/[id] restaure todos
  // los filtros y la página.
  useEffect(() => {
    const params = new URLSearchParams();
    if (preset !== "7d") params.set("preset", preset);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (paymentFilter !== "all") params.set("payment", paymentFilter);
    if (accountFilter !== "all") params.set("account", accountFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== DEFAULT_DATA_TABLE_PAGE_SIZE) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [preset, dateFrom, dateTo, paymentFilter, accountFilter, debouncedSearch, statusFilter, page, pageSize, pathname, replace]);

  // Delete
  const [deletingSale,   setDeletingSale]   = useState<Sale | null>(null);
  const { deleteSale,    isDeleting }       = useDeleteSale();

  const { sales, stats, total, isLoading, mutate } = useSales({
    preset,
    from:       dateFrom    || undefined,
    to:         dateTo      || undefined,
    payment:    paymentFilter,
    search:     debouncedSearch || undefined,
    status:     statusFilter !== "all" ? statusFilter : undefined,
    account_id: accountFilter !== "all" ? accountFilter : undefined,
    page,
    limit:      pageSize,
  });

  const { accounts } = useAccounts();

  const hasFilters = preset !== "7d" || dateFrom || dateTo || paymentFilter !== "all"
    || accountFilter !== "all" || statusFilter !== "all" || search;
  const clearAll = () => {
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPaymentFilter("all");
    setAccountFilter("all");
    setStatusFilter("all");
    setPreset("7d");
    setPage(1);
  };

  const selectedDateRange = dateFrom || dateTo
    ? { from: dateFrom, to: dateTo }
    : salesPresetRange(preset);

  const onDateRangeChange = (range: DateRangeValue) => {
    const today = new Date();
    const matchingPreset = (["today", "7d", "this_month", "last_month", "all"] as const)
      .find((candidate) => {
        const candidateRange = salesPresetRange(candidate, today);
        return candidateRange.from === range.from && candidateRange.to === range.to;
      });

    if (matchingPreset) {
      setPreset(matchingPreset);
      setDateFrom("");
      setDateTo("");
      return;
    }

    setPreset("all");
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const activePeriodLabel = dateFrom || dateTo
    ? [dateFrom && `Desde ${formatDateOnly(dateFrom)}`, dateTo && `Hasta ${formatDateOnly(dateTo)}`].filter(Boolean).join(" · ")
    : PRESET_LABELS[preset];

  const handleDeleteConfirm = async (reason?: string) => {
    if (!deletingSale) return;
    try {
      await deleteSale(deletingSale.id, reason);
      toast.success("Venta anulada · inventario y balance revertidos");
      setDeletingSale(null);
    } catch (err: any) {
      toast.error(err.message || "Error al anular la venta");
    }
  };

  const saleColumns: DataTableTimeSectionColumn<Sale>[] = [
    {
      id: "number", header: "Número", width: "clamp(7rem, 10vw, 8rem)",
      cell: (sale) => <span className="block truncate font-mono font-medium" title={sale.sale_number}>{sale.sale_number}</span>,
    },
    {
      id: "customer", header: "Cliente", width: "clamp(6rem, 12vw, 9rem)",
      cell: (sale) => <span className={`block whitespace-normal break-words leading-snug ${sale.customer_name ? "" : "text-muted-foreground"}`} title={sale.customer_name ?? "Anónimo"}>{sale.customer_name ?? "Anónimo"}</span>,
    },
    {
      id: "status", header: "Estado", width: "clamp(7rem, 11vw, 8.5rem)",
      cell: (sale) => sale.status === "PENDING" ? (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1" variant="outline"><Clock className="size-3" /> Pendiente</Badge>
      ) : sale.status === "CANCELLED" ? (
        <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1" variant="outline"><XCircle className="size-3" /> Cancelada</Badge>
      ) : (
        <Badge className="bg-green-100 text-green-700 border-green-200 gap-1" variant="outline"><CheckCircle className="size-3" /> Completada</Badge>
      ),
    },
    {
      id: "products", header: "Productos", width: "clamp(6rem, 9vw, 7rem)",
      cell: (sale) => <Badge variant="secondary">{sale.items_count} {sale.items_count === 1 ? "producto" : "productos"}</Badge>,
    },
    {
      id: "account", header: "Cuenta", width: "clamp(5rem, 8vw, 7rem)", className: "text-sm text-muted-foreground",
      cell: (sale) => <span className="block truncate" title={sale.account_name ?? undefined}>{sale.account_name ?? "—"}</span>,
    },
    {
      id: "tax", header: "ISV", width: 52, align: "right",
      cell: (sale) => getTaxRate(sale.tax_rate) > 0
        ? <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline">{getTaxRate(sale.tax_rate)}%</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "total", header: "Total", width: 96, align: "right", className: "font-medium",
      cell: (sale) => format(Number(sale.total)),
    },
  ];
  if (showProfit) saleColumns.push({
    id: "profit", header: "Ganancia", width: 96, align: "right",
    cell: (sale) => sale.status === "COMPLETED"
      ? <span className="font-medium text-green-600">{format(Number((sale.net_profit ?? 0) - sale.discount))}</span>
      : <span className="text-xs text-muted-foreground">—</span>,
  });
  saleColumns.push({
    id: "actions", header: <span className="sr-only">Acciones</span>, width: 44, align: "right", stopRowClick: true,
    cell: (sale) => sale.status === "PENDING"
      ? <PendingActions saleId={sale.id} onMutate={mutate} canEdit={canEdit} />
      : sale.status === "COMPLETED"
        ? <CompletedActions sale={sale} onDeleteRequest={setDeletingSale} canDelete={canDelete} />
        : null,
  });

  const renderSaleDate = (_key: string, rows: readonly Sale[]) => {
    const parts = dateTitleFormatter.formatToParts(new Date(rows[0].sold_at));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
    const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("es-HN") + value.slice(1);
    return `${capitalize(part("weekday"))} ${part("day")} de ${capitalize(part("month"))} del ${part("year")}`;
  };

  const renderMobileSale = (sale: Sale) => {
    const payment     = paymentConfig[sale.payment_method] ?? paymentConfig.OTHER;
    const PayIcon     = payment.icon;
    const taxRate     = getTaxRate(sale.tax_rate);
    const isPending   = sale.status === "PENDING";
    const isCancelled = sale.status === "CANCELLED";
    return (
      <Card
        key={sale.id}
        className={`pt-1 pb-1 cursor-pointer active:scale-[0.99] transition-transform ${
          isPending ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10"
          : isCancelled ? "opacity-60" : ""
        }`}
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
                {isCancelled && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/30 gap-1" variant="outline">
                    <XCircle className="size-2.5" /> Cancelada
                  </Badge>
                )}
                {taxRate > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                    ISV {taxRate}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {sale.customer_name ?? "Anónimo"}
              </p>
            </div>
            {isPending ? (
              <PendingActions saleId={sale.id} onMutate={mutate} canEdit={canEdit} />
            ) : isCancelled ? (
              <Badge variant="outline" className="gap-1 text-xs shrink-0">
                <PayIcon className="size-3" /> {sale.account_name}
              </Badge>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className="gap-1 text-xs">
                  <PayIcon className="size-3" /> {sale.account_name}
                </Badge>
                <CompletedActions sale={sale} onDeleteRequest={setDeletingSale} canDelete={canDelete} />
              </div>
            )}
          </div>
          <div className={`grid gap-1 pt-2 border-t text-center ${(!isPending && !isCancelled && showProfit) ? "grid-cols-3" : "grid-cols-2"}`}>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Productos</p>
              <p className="text-sm font-semibold">{sale.items_count}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Total</p>
              <p className="text-sm font-bold truncate">{format(Number(sale.total))}</p>
            </div>
            {!isPending && !isCancelled && showProfit && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Ganancia</p>
                <p className="text-sm font-bold text-green-600 truncate">
                  {format(Number((sale.net_profit ?? 0) - sale.discount))}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
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

      {/* En móvil el conteo permanece en el título; los montos van centrados. */}
      <SummaryStats
        ariaLabel="Resumen de ventas"
        isLoading={isLoading}
        items={[
          {
            label: "Ventas", icon: ShoppingCart, value: stats.completed_count,
            inlineNote: stats.pending_count > 0 ? `${stats.pending_count} pend.` : undefined,
            inlineNoteClassName: "text-amber-600 dark:text-amber-400",
            hideOnMobile: true,
          },
          { label: "Ingresos", icon: Wallet, value: format(stats.total_revenue) },
          ...(showProfit ? [{
            label: "Ganancia", icon: TrendingUp, value: format(stats.total_profit ?? 0),
            valueClassName: "text-green-600 dark:text-green-400",
            inlineNote: stats.total_revenue > 0
              ? `${(((stats.total_profit ?? 0) / stats.total_revenue) * 100).toFixed(0)}%`
              : undefined,
          }] : []),
        ]}
      />

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
                <SelectItem value="CANCELLED">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <DateRangePicker
              value={selectedDateRange}
              onChange={onDateRangeChange}
              presets={SALES_DATE_PRESETS}
            />
          </div>
          <div className="w-[38%] shrink-0">
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
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground w-full" onClick={clearAll}>
            <X className="size-3.5" /> Limpiar filtros
          </Button>
        )}
      </div>

      <DataTableTimeSection
        columns={saleColumns}
        data={sales}
        getRowKey={(sale) => sale.id}
        getGroupKey={(sale) => dateKeyFormatter.format(new Date(sale.sold_at))}
        renderGroupHeader={renderSaleDate}
        renderMobileRow={renderMobileSale}
        onRowClick={(sale) => push(`/sales/${sale.id}`)}
        rowClassName={(sale) => sale.status === "PENDING"
          ? "bg-amber-50/30 dark:bg-amber-950/10"
          : sale.status === "CANCELLED" ? "opacity-60" : undefined}
        pagination={{
          page, pageSize, total, onPageChange: setPage,
          onPageSizeChange: (size) => { setPage(1); setPageSize(size); },
        }}
        hideFooterPaginationOnDesktop
        recordLabel={total === 1 ? "venta" : "ventas"}
        ariaLabel="Ventas"
        isLoading={isLoading}
        emptyState={<div className="flex flex-col items-center gap-3"><Receipt className="size-10 text-muted-foreground/40" /><span>No se encontraron ventas en este período</span></div>}
        minWidth={showProfit ? 820 : 730}
        stickyOffset="var(--data-table-sticky-offset)"
        className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
      />

      <Fab actions={[{ label: "Nueva venta", icon: ShoppingCart, onClick: () => push("/sales/new") }]} />

      {/* Confirm anular venta completada */}
      <CancelSaleDialog
        open={!!deletingSale}
        onOpenChange={(v) => { if (!v) setDeletingSale(null); }}
        title={`¿Anular ${deletingSale?.sale_number ?? "esta venta"}?`}
        description="Se revertirá el inventario, el balance de la cuenta y los totales del cliente. La venta quedará marcada como cancelada."
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

    </div>
  );
}
