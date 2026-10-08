"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, SlidersHorizontal,
  TrendingUp, TrendingDown, MoreVertical, Pencil, Trash2, CreditCard,
  Banknote, Building2, Wallet,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useTransactions, useTransactionPeriods, useDeleteTransaction,
  Transaction,
} from "@/hooks/swr/use-transactions";
import { useSWRConfig } from "swr";
import { Fab } from "@/components/ui/fab";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useCreditCards, useAllCreditCardTransactions, AllCardTransaction } from "@/hooks/swr/use-credit-cards";
import { CreateTransactionModal } from "@/components/transactions/create-transaction-modal";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { PurchaseDetailDialog } from "@/components/products/purchase-detail-dialog";
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar";
import {
  DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE,
  type DataTableTimeSectionColumn,
} from "@/components/shared/data-table-time-section";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useTimezone } from "@/hooks/swr/use-timezone";

// ── Helpers ────────────────────────────────────────────────────────────
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("es-HN", {
    day: "numeric", month: "short", year: "numeric",
  });

const MONTH_NAMES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TYPE_CONFIG = {
  INCOME: {
    label: "Ingreso",
    icon: ArrowDownCircle,
    color: "text-green-600",
    badge: "bg-green-100 text-green-700 border-green-200",
    sign: "+",
  },
  EXPENSE: {
    label: "Egreso",
    icon: ArrowUpCircle,
    color: "text-destructive",
    badge: "bg-red-100 text-red-700 border-red-200",
    sign: "-",
  },
  TRANSFER: {
    label: "Transferencia",
    icon: ArrowLeftRight,
    color: "text-blue-600",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    sign: "",
  },
};

const CC_TYPE_CONFIG = {
  CHARGE: {
    label: "Cargo CC",
    icon: CreditCard,
    color: "text-destructive",
    badge: "bg-red-100 text-red-700 border-red-200",
    sign: "-",
  },
  PAYMENT: {
    label: "Pago CC",
    icon: CreditCard,
    color: "text-green-600",
    badge: "bg-green-100 text-green-700 border-green-200",
    sign: "+",
  },
};

const REF_LABELS: Record<string, string> = {
  SALE: "Venta",
  PURCHASE: "Compra inventario",
  SUPPLY_PURCHASE: "Compra suministros",
  EVENT: "Evento",
  OTHER: "Manual",
  CREDIT_CARD_PAYMENT: "Pago tarjeta",
};

// ── Unified row type ───────────────────────────────────────────────────
type Row =
  | { _src: "account"; data: Transaction }
  | { _src: "cc"; data: AllCardTransaction };

// ── Module-level Actions menu (solo transacciones de cuenta) ──────────
function ActionsMenu({
  t,
  isEditable,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  t: Transaction;
  isEditable: (t: Transaction) => boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (!isEditable(t) || (!canEdit && !canDelete)) return <div className="w-8" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(t); }}>
            <Pencil className="size-4 mr-2" />
            Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(t); }}
            >
              <Trash2 className="size-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Page ───────────────────────────────────────────────────────────────
const TYPE_FILTERS = ["all", "INCOME", "EXPENSE", "TRANSFER"] as const;

export default function TransactionsPage() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mutate: globalMutate } = useSWRConfig();
  const timezone = useTimezone();
  const dateKeyFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }), [timezone]);
  const dateTitleFormatter = useMemo(() => new Intl.DateTimeFormat("es-HN", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "2-digit",
  }), [timezone]);
  const now = new Date();

  // Filtros restaurados desde la URL — "volver" desde /sales/[id] (cuando
  // se hace clic en una transacción de tipo SALE) trae de vuelta esta
  // misma URL con todos los filtros y la página ya aplicados.
  const [filterMode, setFilterMode] = useState<"month" | "date">(() => {
    const v = searchParams.get("mode");
    return v === "date" ? "date" : "month";
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const v = Number(searchParams.get("year"));
    return v > 0 ? v : now.getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const v = Number(searchParams.get("month"));
    return v >= 1 && v <= 12 ? v : now.getMonth() + 1;
  });
  const [specificDate, setSpecificDate] = useState(() => searchParams.get("date") ?? "");
  const [sourceFilter, setSourceFilter] = useState<string>(() => {
    const accountId = searchParams.get("account_id");
    return accountId ? accountId : "all";
  }); // "all" | "cc-{id}" | account_id
  const [typeFilter, setTypeFilter] = useState<string>(() => {
    const v = searchParams.get("type");
    return v && (TYPE_FILTERS as readonly string[]).includes(v) ? v : "all";
  });
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isInteger(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  const debouncedSearch = useDebounce(search, 300);
  const isSearching = debouncedSearch.trim().length > 0;

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [viewingPurchaseId, setViewingPurchaseId] = useState<number | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState<"expense" | "income">("expense");

  const { deleteTransaction, isDeleting } = useDeleteTransaction();

  const periodParams = {
    month: filterMode === "month" ? selectedMonth : undefined,
    year: filterMode === "month" ? selectedYear : undefined,
    date: filterMode === "date" && specificDate ? specificDate : undefined,
  };

  const isCardFilter = sourceFilter.startsWith("cc-");
  const selectedCardId = isCardFilter ? Number(sourceFilter.replace("cc-", "")) : undefined;
  const isAccountFilter = !isCardFilter && sourceFilter !== "all";

  // Para account transactions: type se envía al server solo cuando aplica
  // (TRANSFER no existe en CC, INCOME/EXPENSE se mapean en client para CC)
  const accountTypeFilter =
    typeFilter === "INCOME" || typeFilter === "EXPENSE" || typeFilter === "TRANSFER"
      ? typeFilter
      : undefined;

  const { transactions, totals, isLoading: loadingAcc, mutate } = useTransactions({
    account_id: isAccountFilter ? Number(sourceFilter) : undefined,
    type: accountTypeFilter,
    search: isSearching ? debouncedSearch.trim() : undefined,
    // Si el filtro es una tarjeta, las transacciones de cuenta no se muestran:
    // no tiene sentido pedirlas (y sus totales serían de otra fuente).
    enabled: !isCardFilter,
    ...(isSearching ? {} : periodParams),
  });

  const { transactions: ccTxs, isLoading: loadingCC } = useAllCreditCardTransactions({
    card_id: selectedCardId,
    search: isSearching ? debouncedSearch.trim() : undefined,
    ...(isSearching ? {} : periodParams),
  });

  const { periods } = useTransactionPeriods();
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();
  const { format } = useCurrency();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("FINANCES");

  const isLoading = loadingAcc || loadingCC;

  const availableYears = [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a);
  const monthsForYear = (y: number) =>
    periods.filter((p) => p.year === y).map((p) => p.month).sort((a, b) => b - a);

  // Al filtrar por tarjeta, los tiles se calculan de los movimientos de la
  // tarjeta (cargos/pagos), no de las transacciones de cuenta.
  const ccTotals = useMemo(() => {
    let charges = 0, payments = 0;
    for (const t of ccTxs) {
      const amt = t.currency === "USD" && t.amount_local != null
        ? Number(t.amount_local)
        : Number(t.amount);
      if (t.type === "CHARGE") charges += amt;
      else payments += amt;
    }
    return { charges, payments };
  }, [ccTxs]);

  const displayTotals = isCardFilter
    ? { income: ccTotals.payments, expense: ccTotals.charges }
    : { income: totals.income, expense: totals.expense };

  const neto = displayTotals.income - displayTotals.expense;

  const periodLabel = isSearching
    ? `Resultados para "${debouncedSearch.trim()}"`
    : filterMode === "date" && specificDate
      ? formatDate(specificDate)
      : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  // Reset page on filter changes — no en el primer render, para no pisar
  // la página restaurada desde la URL.
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    setPage(1);
  }, [
    typeFilter, sourceFilter, filterMode,
    selectedMonth, selectedYear, specificDate, debouncedSearch,
  ]);

  // Reflejar los filtros en la URL (replace, no push) — permite que
  // "volver" desde /sales/[id] restaure todos los filtros y la página.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterMode !== "month") params.set("mode", filterMode);
    if (selectedYear !== now.getFullYear()) params.set("year", String(selectedYear));
    if (selectedMonth !== now.getMonth() + 1) params.set("month", String(selectedMonth));
    if (specificDate) params.set("date", specificDate);
    if (sourceFilter !== "all") params.set("account_id", sourceFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    filterMode, selectedYear, selectedMonth, specificDate,
    sourceFilter, typeFilter, debouncedSearch, page, pathname, replace,
  ]);

  // Sincroniza la pestaña del gráfico con el filtro de tipo
  useEffect(() => {
    if (typeFilter === "EXPENSE") setAnalyticsTab("expense");
    else if (typeFilter === "INCOME") setAnalyticsTab("income");
  }, [typeFilter]);

  // ── Merge & filter ─────────────────────────────────────────────────
  const rows = useMemo<Row[]>(() => {
    // account transactions ya vienen filtradas por type desde el server
    const accRows: Row[] = (isCardFilter ? [] : transactions)
      .map((t) => ({ _src: "account" as const, data: t }));

    // CC transactions se filtran client-side
    const ccRows: Row[] = (isAccountFilter ? [] : ccTxs)
      .filter((t) => {
        if (typeFilter === "all" || typeFilter === "TRANSFER") return typeFilter !== "TRANSFER";
        if (typeFilter === "EXPENSE") return t.type === "CHARGE";
        if (typeFilter === "INCOME") return t.type === "PAYMENT";
        return true;
      })
      .map((t) => ({ _src: "cc" as const, data: t }));

    return [...accRows, ...ccRows].sort(
      (a, b) =>
        new Date(b.data.occurred_at).getTime() -
        new Date(a.data.occurred_at).getTime()
    );
  }, [transactions, ccTxs, typeFilter, isCardFilter, isAccountFilter]);

  // ── Paginación client-side de rows ─────────────────────────────────
  const totalRows = rows.length;
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const renderTransactionDate = (_key: string, groupedRows: readonly Row[]) => {
    const parts = dateTitleFormatter.formatToParts(new Date(groupedRows[0].data.occurred_at));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
    const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("es-HN") + value.slice(1);
    return `${capitalize(part("weekday"))} ${part("day")} de ${capitalize(part("month"))} del ${part("year")}`;
  };

  const PIE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#f97316", "#14b8a6"];

  const categoryData = useMemo(() => {
    const expenseMap = new Map<string, number>();
    const incomeMap = new Map<string, number>();

    for (const row of rows) {
      if (row._src === "account") {
        const t = row.data;
        // El pago de tarjeta no es gasto nuevo: el consumo ya está
        // representado por los cargos CC (evita doble conteo).
        if (t.reference_type === "CREDIT_CARD_PAYMENT") continue;
        const label = t.category?.trim() || "Sin categoría";
        if (t.type === "EXPENSE") {
          expenseMap.set(label, (expenseMap.get(label) ?? 0) + Number(t.amount));
        } else if (t.type === "INCOME") {
          incomeMap.set(label, (incomeMap.get(label) ?? 0) + Number(t.amount));
        }
      } else {
        const t = row.data;
        // Los pagos CC tampoco son ingreso: solo reducen deuda.
        if (t.type !== "CHARGE") continue;
        const label = t.category?.trim() || "Sin categoría";
        const amt = t.currency === "USD" && t.amount_local != null
          ? Number(t.amount_local)
          : Number(t.amount);
        expenseMap.set(label, (expenseMap.get(label) ?? 0) + amt);
      }
    }

    const toArr = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }));

    return { expenses: toArr(expenseMap), income: toArr(incomeMap) };
  }, [rows]);

  const isPurchaseRef = (t: Transaction) =>
    (t.reference_type === "PURCHASE" || t.reference_type === "PURCHASE_SHIPPING") && !!t.reference_id;

  const handleTransactionClick = (t: Transaction) => {
    if (t.reference_type === "SALE" && t.reference_id) {
      push(`/sales/${t.reference_id}`);
    } else if (isPurchaseRef(t)) {
      setViewingPurchaseId(t.reference_id);
    }
  };

  const invalidateAll = () => {
    globalMutate((key) =>
      typeof key === "string" && (
        key.startsWith("/api/transactions") ||
        key.startsWith("/api/accounts") ||
        key.startsWith("/api/finances") ||
        key.startsWith("/api/credit-card-transactions")
      )
    );
  };

  const handleDelete = async () => {
    if (!deletingTx) return;
    try {
      await deleteTransaction(deletingTx.id);
      toast.success("Transacción eliminada");
      setDeletingTx(null);
      invalidateAll();
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar");
    }
  };

  const isEditable = (t: Transaction) => t.reference_type === "OTHER" || !t.reference_type;

  // ── Row renderers ──────────────────────────────────────────────────
  const renderMobileCard = (row: Row) => {
    if (row._src === "account") {
      const t = row.data;
      const cfg = TYPE_CONFIG[t.type];
      const Icon = cfg.icon;
      const clickable = (t.reference_type === "SALE" || isPurchaseRef(t)) && t.reference_id;
      const isCancelled = !!t.deleted_at;
      return (
        <Card
          className={`pt-3 pb-2.5 ${isCancelled ? "opacity-60" : ""} ${clickable ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
          onClick={() => handleTransactionClick(t)}
        >
          <CardContent className="pl-3.5">
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Icon className={`size-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isCancelled ? "line-through" : ""}`}>
                      {t.description || REF_LABELS[t.reference_type ?? "OTHER"] || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.account_name}
                      {t.to_account_name && <span> → {t.to_account_name}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ActionsMenu t={t} isEditable={isEditable} onEdit={setEditingTx} onDelete={setDeletingTx} canEdit={canEdit} canDelete={canDelete} />
                    <div className="text-right">
                      <p className={`text-sm font-bold ${cfg.color}`}>
                        {cfg.sign}{format(Number(t.amount))}
                      </p>
                      {isCancelled ? (
                        <Badge className="text-[10px] mt-0.5 bg-destructive/10 text-destructive border-destructive/30" variant="outline">
                          Cancelada
                        </Badge>
                      ) : (
                        <Badge className={`text-[10px] mt-0.5 ${cfg.badge}`} variant="outline">
                          {cfg.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // CC transaction
    const t = row.data;
    const cfg = CC_TYPE_CONFIG[t.type];
    const Icon = cfg.icon;
    const isUsd = t.currency === "USD";
    return (
      <Card className="pt-3 pb-2.5">
        <CardContent className="pl-3.5">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Icon className={`size-4 ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.description || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.card_name}{t.last_four ? ` ···· ${t.last_four}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${cfg.color}`}>
                    {cfg.sign}{isUsd
                      ? `$${Number(t.amount).toFixed(2)}`
                      : format(Number(t.amount))
                    }
                  </p>
                  {isUsd && t.amount_local != null && (
                    <p className="text-[10px] text-muted-foreground">
                      ≈ {format(Number(t.amount_local))}
                    </p>
                  )}
                  <Badge className={`text-[10px] mt-0.5 ${cfg.badge}`} variant="outline">
                    {cfg.label}
                    {isUsd && <span className="ml-1">USD</span>}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const transactionColumns: DataTableTimeSectionColumn<Row>[] = [
    {
      id: "type", header: "Tipo", width: 138,
      cell: (row) => {
        if (row._src === "account") {
          const transaction = row.data;
          const config = TYPE_CONFIG[transaction.type];
          const Icon = config.icon;
          return transaction.deleted_at ? (
            <Badge className="gap-1 border-destructive/30 bg-destructive/10 text-destructive" variant="outline">
              {config.label} · Cancelada
            </Badge>
          ) : (
            <Badge className={`gap-1 ${config.badge}`} variant="outline"><Icon className="size-3" />{config.label}</Badge>
          );
        }
        const config = CC_TYPE_CONFIG[row.data.type];
        const Icon = config.icon;
        return (
          <Badge className={`gap-1 ${config.badge}`} variant="outline">
            <Icon className="size-3" />{config.label}
          </Badge>
        );
      },
    },
    {
      id: "description", header: "Descripción", width: "clamp(11rem, 22vw, 18rem)",
      className: "text-sm",
      cell: (row) => {
        const description = row.data.description || "—";
        const isCancelled = row._src === "account" && !!row.data.deleted_at;
        return <span className={cn("block truncate", isCancelled && "line-through")} title={description}>{description}</span>;
      },
    },
    {
      id: "account", header: "Cuenta / Tarjeta", width: "clamp(10rem, 18vw, 15rem)",
      className: "text-sm",
      cell: (row) => row._src === "account" ? (
        <span>
          {row.data.account_name}
          {row.data.to_account_name && <span className="text-muted-foreground"> → {row.data.to_account_name}</span>}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <CreditCard className="size-3 shrink-0 text-muted-foreground" />
          {row.data.card_name}{row.data.last_four ? ` ···· ${row.data.last_four}` : ""}
        </span>
      ),
    },
    {
      id: "origin", header: "Origen", width: 145,
      cell: (row) => (
        <Badge variant="secondary" className="text-xs">
          {row._src === "account" ? REF_LABELS[row.data.reference_type ?? "OTHER"] ?? "Manual" : "Tarjeta crédito"}
        </Badge>
      ),
    },
    {
      id: "amount", header: "Monto", width: 145, align: "right",
      cell: (row) => {
        if (row._src === "account") {
          const config = TYPE_CONFIG[row.data.type];
          return <span className={`font-bold ${config.color}`}>{config.sign}{format(Number(row.data.amount))}</span>;
        }
        const config = CC_TYPE_CONFIG[row.data.type];
        const isUsd = row.data.currency === "USD";
        return (
          <span className={`font-bold ${config.color}`}>
            {config.sign}{isUsd ? `$${Number(row.data.amount).toFixed(2)} USD` : format(Number(row.data.amount))}
            {isUsd && row.data.amount_local != null && (
              <span className="block text-[10px] font-normal text-muted-foreground">≈ {format(Number(row.data.amount_local))}</span>
            )}
          </span>
        );
      },
    },
    {
      id: "actions", header: <span className="sr-only">Acciones</span>, width: 48,
      align: "right", stopRowClick: true,
      cell: (row) => row._src === "account" ? (
        <ActionsMenu t={row.data} isEditable={isEditable} onEdit={setEditingTx} onDelete={setDeletingTx} canEdit={canEdit} canDelete={canDelete} />
      ) : <div className="w-8" />,
    },
  ];

  return (
    <div className="space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transacciones</h1>
          <p className="text-muted-foreground text-sm">{periodLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4 w-full items-stretch">
        <div className="flex flex-col gap-3">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: isCardFilter ? "Pagos a tarjeta" : "Ingresos", value: displayTotals.income, color: "text-green-600", icon: TrendingUp },
              { label: isCardFilter ? "Cargos a tarjeta" : "Egresos", value: displayTotals.expense, color: "text-destructive", icon: TrendingDown },
              { label: "Neto", value: neto, color: neto >= 0 ? "text-green-600" : "text-destructive", icon: ArrowLeftRight },
            ].map((s, index) => (
              <Card key={s.label} className={index === 2 ? "col-span-2" : ""}>
                <CardContent className="pl-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
                    <s.icon className="size-3 text-muted-foreground shrink-0" />
                  </div>
                  <div className={`text-sm font-bold ${s.color}`}>
                    {isLoading ? <Skeleton className="h-4 w-16" /> : format(s.value)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Filtros */}
          <div className="flex-1 space-y-2.5">
            <div>
              <SearchBar
                value={search}
                onChange={setSearch}
                size="full"
                placeholder="Buscar por detalle de la transacción..."
              />
              {isSearching && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Búsqueda global: se ignora el filtro de periodo
                </p>
              )}
            </div>

            <div className={isSearching ? "opacity-50 pointer-events-none" : ""}>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border">
                {(["month", "date"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={cn(
                      "rounded-lg py-2 text-sm font-medium transition-all duration-200",
                      filterMode === mode
                        ? "rounded-xl bg-primary/15 text-primary"
                        : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary",
                    )}
                  >
                    {mode === "month" ? "Por mes" : "Fecha exacta"}
                  </button>
                ))}
              </div>

              {filterMode === "month" ? (
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthsForYear(selectedYear).map((m) => (
                        <SelectItem key={m} value={String(m)}>{MONTH_NAMES[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(selectedYear)}
                    onValueChange={(v) => {
                      const y = Number(v);
                      setSelectedYear(y);
                      const months = periods.filter((p) => p.year === y).map((p) => p.month);
                      if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months[0]);
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Input
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="w-full mt-2.5"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Fuente: cuentas + tarjetas */}
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Fuente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fuentes</SelectItem>
                  {accounts.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Cuentas
                      </div>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </>
                  )}
                  {creditCards.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Tarjetas de crédito
                      </div>
                      {creditCards.map((c) => (
                        <SelectItem key={c.id} value={`cc-${c.id}`}>
                          {c.name}{c.last_four ? ` ···· ${c.last_four}` : ""}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="INCOME">Ingresos / Pagos CC</SelectItem>
                  <SelectItem value="EXPENSE">Egresos / Cargos CC</SelectItem>
                  <SelectItem value="TRANSFER">Transferencias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>
        <div className="h-full">
          {!isLoading && rows.length > 0 && (
            <Card className="pt-1 pb-1 h-full">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Por categoría</p>
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl border text-xs">
                    {(["expense", "income"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAnalyticsTab(tab)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 font-medium transition-all duration-200",
                          analyticsTab === tab
                            ? "rounded-xl bg-primary/15 text-primary"
                            : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary",
                        )}
                      >
                        {tab === "expense" ? "Egresos" : "Ingresos"}
                      </button>
                    ))}
                  </div>
                </div>
                {(analyticsTab === "expense" ? categoryData.expenses : categoryData.income).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sin datos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={analyticsTab === "expense" ? categoryData.expenses : categoryData.income}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="42%"
                        innerRadius={46}
                        outerRadius={72}
                        paddingAngle={2}
                      >
                        {(analyticsTab === "expense" ? categoryData.expenses : categoryData.income).map((cat, i) => (
                          <Cell key={cat.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => format(v)}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value) => (
                          <span style={{ color: "var(--foreground)", fontSize: 11 }}>
                            {value.length > 18 ? value.slice(0, 18) + "…" : value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}
        </div>


      </div>


      {/* Banner de cuenta/tarjeta seleccionada */}
      {sourceFilter !== "all" && (() => {
        if (isAccountFilter) {
          const selectedAccount = accounts.find((a) => String(a.id) === sourceFilter);
          if (!selectedAccount) return null;
          const BANNER_ICONS: Record<string, React.ElementType> = {
            CASH: Banknote, BANK: Building2, WALLET: CreditCard, OTHER: Wallet,
          };
          const Icon = BANNER_ICONS[selectedAccount.type] ?? Wallet;
          const ACCOUNT_TYPE_LABELS: Record<string, string> = {
            CASH: "Efectivo", BANK: "Banco", WALLET: "Billetera digital", OTHER: "Otro",
          };
          return (
            <Card className="bg-muted/40">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{selectedAccount.name}</p>
                  <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[selectedAccount.type] ?? "Cuenta"}</p>
                </div>
                <p className="text-sm font-bold shrink-0">{format(Number(selectedAccount.balance))}</p>
              </CardContent>
            </Card>
          );
        }
        if (isCardFilter) {
          const selectedCard = creditCards.find((c) => c.id === selectedCardId);
          if (!selectedCard) return null;
          return (
            <Card className="bg-muted/40">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CreditCard className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold">{selectedCard.name}</p>
                    {selectedCard.last_four && (
                      <Badge variant="outline" className="font-mono text-[10px]">···· {selectedCard.last_four}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedCard.balance > 0 && (
                      <span className="text-destructive">{format(Number(selectedCard.balance))}</span>
                    )}
                    {selectedCard.balance > 0 && selectedCard.balance_usd > 0 && " · "}
                    {selectedCard.balance_usd > 0 && (
                      <span className="text-destructive">${Number(selectedCard.balance_usd).toFixed(2)} USD</span>
                    )}
                    {selectedCard.balance === 0 && selectedCard.balance_usd === 0 && "Sin deuda"}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        }
        return null;
      })()}

      <DataTableTimeSection
        columns={transactionColumns}
        data={pagedRows}
        getRowKey={(row) => row._src === "account" ? `acc-${row.data.id}` : `cc-${row.data.id}`}
        getGroupKey={(row) => dateKeyFormatter.format(new Date(row.data.occurred_at))}
        renderGroupHeader={renderTransactionDate}
        renderMobileRow={(row) => renderMobileCard(row)}
        onRowClick={(row) => row._src === "account" && handleTransactionClick(row.data)}
        isRowClickable={(row) => row._src === "account" && (
          row.data.reference_type === "SALE" || isPurchaseRef(row.data)
        )}
        rowClassName={(row) => row._src === "account" && row.data.deleted_at ? "opacity-60" : undefined}
        isLoading={isLoading}
        emptyState={(
          <div className="flex flex-col items-center justify-center gap-2">
            <SlidersHorizontal className="size-10 text-muted-foreground/40" />
            <span>No hay transacciones en este período</span>
          </div>
        )}
        recordLabel={totalRows === 1 ? "transacción" : "transacciones"}
        ariaLabel="Transacciones"
        minWidth={930}
        stickyOffset="var(--data-table-sticky-offset)"
        className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
        showFooterPagination={false}
        pagination={{
          page,
          pageSize,
          total: totalRows,
          onPageChange: setPage,
          onPageSizeChange: (size) => { setPage(1); setPageSize(size); },
        }}
      />

      {/* FAB */}
      {canEdit && (
        <Fab
          actions={[{
            label: "Nueva transacción",
            icon: ArrowLeftRight,
            onClick: () => setModalOpen(true),
          }]}
        />
      )}

      {/* Modal crear */}
      <CreateTransactionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        accounts={accounts}
        creditCards={creditCards}
        onSuccess={() => { invalidateAll(); setModalOpen(false); }}
      />

      {/* Modal editar */}
      {editingTx && (
        <EditTransactionModal
          open={!!editingTx}
          transaction={editingTx}
          accounts={accounts}
          onOpenChange={(v) => { if (!v) setEditingTx(null); }}
          onSuccess={() => { setEditingTx(null); invalidateAll(); }}
        />
      )}

      {/* Confirm eliminar */}
      <AlertDialog open={!!deletingTx} onOpenChange={(v) => { if (!v) setDeletingTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revertirá el balance de la cuenta. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detalle de compra (lote de inventario) */}
      <PurchaseDetailDialog
        purchaseId={viewingPurchaseId}
        open={!!viewingPurchaseId}
        onOpenChange={(v) => { if (!v) setViewingPurchaseId(null); }}
      />

    </div>
  );
}
