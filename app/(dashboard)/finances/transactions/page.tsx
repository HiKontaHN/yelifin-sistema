"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, SlidersHorizontal,
  TrendingUp, TrendingDown, MoreVertical, Pencil, Trash2, CreditCard,
  Banknote, Building2, Wallet,
} from "lucide-react";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
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
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

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
export default function TransactionsPage() {
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const { mutate: globalMutate } = useSWRConfig();
  const now = new Date();

  const [filterMode, setFilterMode] = useState<"month" | "date">("month");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [specificDate, setSpecificDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>(() => {
    const accountId = searchParams.get("account_id");
    return accountId ? accountId : "all";
  }); // "all" | "cc-{id}" | account_id
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageLimit = 15;

  const debouncedSearch = useDebounce(search, 300);
  const isSearching = debouncedSearch.trim().length > 0;

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
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

  // Reset page on filter changes
  useEffect(() => { setPage(1); }, [
    typeFilter, sourceFilter, filterMode,
    selectedMonth, selectedYear, specificDate, debouncedSearch,
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
  const totalPages = Math.max(1, Math.ceil(totalRows / pageLimit));
  const pagedRows = rows.slice((page - 1) * pageLimit, page * pageLimit);

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

  const handleTransactionClick = (t: Transaction) => {
    if (t.reference_type === "SALE" && t.reference_id) {
      push(`/sales/${t.reference_id}`);
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
  const renderMobileCard = (row: Row, i: number) => {
    if (row._src === "account") {
      const t = row.data;
      const cfg = TYPE_CONFIG[t.type];
      const Icon = cfg.icon;
      const clickable = t.reference_type === "SALE" && t.reference_id;
      return (
        <Card
          key={`acc-${t.id}`}
          className={`pt-3 pb-2.5 ${clickable ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
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
                    <p className="text-sm font-medium truncate">
                      {t.description || REF_LABELS[t.reference_type ?? "OTHER"] || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.account_name}
                      {t.to_account_name && <span> → {t.to_account_name}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.occurred_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ActionsMenu t={t} isEditable={isEditable} onEdit={setEditingTx} onDelete={setDeletingTx} canEdit={canEdit} canDelete={canDelete} />
                    <div className="text-right">
                      <p className={`text-sm font-bold ${cfg.color}`}>
                        {cfg.sign}{format(Number(t.amount))}
                      </p>
                      <Badge className={`text-[10px] mt-0.5 ${cfg.badge}`} variant="outline">
                        {cfg.label}
                      </Badge>
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
      <Card key={`cc-${t.id}`} className="pt-3 pb-2.5">
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
                  <p className="text-xs text-muted-foreground">{formatDate(t.occurred_at)}</p>
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

  const renderDesktopRow = (row: Row) => {
    if (row._src === "account") {
      const t = row.data;
      const cfg = TYPE_CONFIG[t.type];
      const Icon = cfg.icon;
      const clickable = t.reference_type === "SALE" && t.reference_id;
      return (
        <TableRow
          key={`acc-${t.id}`}
          className={clickable ? "cursor-pointer hover:bg-muted/50" : ""}
          onClick={() => handleTransactionClick(t)}
        >
          <TableCell>
            <Badge className={`gap-1 ${cfg.badge}`} variant="outline">
              <Icon className="size-3" />
              {cfg.label}
            </Badge>
          </TableCell>
          <TableCell className="max-w-48 truncate text-sm">
            {t.description || "—"}
          </TableCell>
          <TableCell className="text-sm">
            {t.account_name}
            {t.to_account_name && (
              <span className="text-muted-foreground"> → {t.to_account_name}</span>
            )}
          </TableCell>
          <TableCell>
            <Badge variant="secondary" className="text-xs">
              {REF_LABELS[t.reference_type ?? "OTHER"] ?? "Manual"}
            </Badge>
          </TableCell>
          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDate(t.occurred_at)}
          </TableCell>
          <TableCell className={`text-right font-bold ${cfg.color}`}>
            {cfg.sign}{format(Number(t.amount))}
          </TableCell>
          <TableCell>
            <ActionsMenu t={t} isEditable={isEditable} onEdit={setEditingTx} onDelete={setDeletingTx} canEdit={canEdit} canDelete={canDelete} />
          </TableCell>
        </TableRow>
      );
    }

    // CC transaction
    const t = row.data;
    const cfg = CC_TYPE_CONFIG[t.type];
    const Icon = cfg.icon;
    const isUsd = t.currency === "USD";
    return (
      <TableRow key={`cc-${t.id}`}>
        <TableCell>
          <Badge className={`gap-1 ${cfg.badge}`} variant="outline">
            <Icon className="size-3" />
            {cfg.label}
          </Badge>
        </TableCell>
        <TableCell className="max-w-48 truncate text-sm">
          {t.description || "—"}
        </TableCell>
        <TableCell className="text-sm">
          <span className="flex items-center gap-1">
            <CreditCard className="size-3 text-muted-foreground shrink-0" />
            {t.card_name}{t.last_four ? ` ···· ${t.last_four}` : ""}
          </span>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs">
            Tarjeta crédito
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDate(t.occurred_at)}
        </TableCell>
        <TableCell className={`text-right font-bold ${cfg.color}`}>
          <span>
            {cfg.sign}{isUsd
              ? `$${Number(t.amount).toFixed(2)} USD`
              : format(Number(t.amount))
            }
          </span>
          {isUsd && t.amount_local != null && (
            <p className="text-[10px] font-normal text-muted-foreground">
              ≈ {format(Number(t.amount_local))}
            </p>
          )}
        </TableCell>
        <TableCell>
          <div className="w-8" />
        </TableCell>
      </TableRow>
    );
  };

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

      {/* Cards — móvil */}
      <div className="space-y-2.5 lg:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <SlidersHorizontal className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No hay transacciones en este período
              </p>
            </CardContent>
          </Card>
        ) : (
          pagedRows.map((row, i) => renderMobileCard(row, i))
        )}
      </div>

      {/* Tabla — desktop */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Cuenta / Tarjeta</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No hay transacciones en este período
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((row) => renderDesktopRow(row))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground order-2 sm:order-1">
            {totalRows} transacción{totalRows !== 1 ? "es" : ""} · página {page} de {totalPages}
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
                .filter((p) => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <PaginationItem key={`ellipsis-${i}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink isActive={p === page} onClick={() => setPage(p as number)} className="cursor-pointer">
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

    </div>
  );
}
