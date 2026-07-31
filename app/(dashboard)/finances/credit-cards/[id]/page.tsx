// app/(dashboard)/finances/credit-cards/[id]/page.tsx
"use client";

import { useState } from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  CreditCard, ArrowLeft, Banknote, ShoppingBag,
  CalendarDays, TrendingUp, DollarSign, Tag,
  MoreVertical, Pencil, Trash2, ArrowLeftRight,
} from "lucide-react";
import {
  useCreditCard,
  useCreditCardTransactions,
  useCreditCardPeriods,
  useCreditCardTxnSearch,
  useDeleteCCTransaction,
  useCreditCards,
  CreditCardTransaction,
} from "@/hooks/swr/use-credit-cards";
import { SearchBar } from "@/components/shared/search-bar";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTransactionCategories } from "@/hooks/swr/use-transaction-categories";
import { toast } from "sonner";
import { PayCreditCardDialog } from "@/components/credit-cards/pay-credit-card-dialog";
import { EditCCTransactionDialog } from "@/components/credit-cards/edit-cc-transaction-dialog";
import { CreateTransactionModal } from "@/components/transactions/create-transaction-modal";
import { Fab } from "@/components/ui/fab";

const MONTH_NAMES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function CreditCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const cardId = Number(id);
  const { back } = useRouter();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [payOpen, setPayOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<CreditCardTransaction | null>(null);
  const [deletingTxn, setDeletingTxn] = useState<CreditCardTransaction | null>(null);
  const [search, setSearch] = useState("");

  const { creditCard, isLoading: loadingCard, mutate: mutateCard } = useCreditCard(cardId);
  const { transactions, totals, isLoading: loadingTxns, mutate: mutateTxns } = useCreditCardTransactions(cardId, {
    month:     selectedMonth,
    year:      selectedYear,
    tz_offset: new Date().getTimezoneOffset(),
  });
  const { periods } = useCreditCardPeriods(cardId);
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();
  const { format, currency } = useCurrency();
  const { deleteTransaction, isDeleting } = useDeleteCCTransaction();
  const { categories: expenseCategories } = useTransactionCategories("EXPENSE");

  // Busca primero en el período visible; si no hay coincidencias,
  // consulta todos los períodos de la tarjeta (debounced + cacheado).
  const {
    results: visibleTxns,
    source: searchSource,
    isSearching,
  } = useCreditCardTxnSearch(cardId, search, transactions);
  const isGlobalResult = search.trim() !== "" && searchSource === "remote";

  const handlePaySuccess = () => {
    mutateCard();
    mutateTxns();
    setPayOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingTxn) return;
    try {
      await deleteTransaction(deletingTxn.id);
      toast.success("Cargo eliminado");
      setDeletingTxn(null);
      mutateCard();
      mutateTxns();
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar");
    }
  };

  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  const availableYears = [...new Set([
    ...periods.map((p) => p.year),
    currentYear,
  ])].sort((a, b) => b - a);

  const monthsForYear = (y: number) => {
    const fromPeriods = periods.filter((p) => p.year === y).map((p) => p.month);
    const withCurrent = y === currentYear && !fromPeriods.includes(currentMonth)
      ? [...fromPeriods, currentMonth]
      : fromPeriods;
    return [...new Set(withCurrent)].sort((a, b) => b - a);
  };

  const yearOptions  = availableYears;
  const monthOptions = monthsForYear(selectedYear);

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {loadingCard ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight">{creditCard?.name ?? "Tarjeta"}</h1>
              {creditCard?.last_four && (
                <Badge variant="outline" className="font-mono text-xs">.... {creditCard.last_four}</Badge>
              )}
            </div>
          )}
          <p className="text-muted-foreground text-sm">Detalle de tarjeta de credito</p>
        </div>
      </div>

      {/* Card info */}
      {loadingCard ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : creditCard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Saldo pendiente */}
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-4 pt-0 pb-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium opacity-80">Saldo pendiente</p>
                <CreditCard className="size-5 opacity-60" />
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-xs opacity-60">{currency}</p>
                  <p className="text-2xl font-bold">{format(Number(creditCard.balance))}</p>
                </div>
                {Number(creditCard.balance_usd) > 0 && (
                  <div>
                    <p className="text-xs opacity-60">USD</p>
                    <p className="text-2xl font-bold flex items-center gap-0.5">
                      <DollarSign className="size-4" />
                      {Number(creditCard.balance_usd).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {creditCard.credit_limit && (
                  <p className="text-xs opacity-60">
                    Límite: {format(Number(creditCard.credit_limit))}
                  </p>
                )}
                {creditCard.payment_due_day && (
                  <p className="text-xs opacity-60 flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    Pago: día {creditCard.payment_due_day}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Saldo al corte */}
          <Card className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="p-4 pt-0 pb-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Saldo al corte</p>
                <CalendarDays className="size-5 text-amber-500" />
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{currency}</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {format(creditCard.statement_balance_local ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">USD</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                    <DollarSign className="size-4" />
                    {(creditCard.statement_balance_usd ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {creditCard.statement_closing_day && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    Corte: día {creditCard.statement_closing_day}
                  </p>
                )}
                {creditCard.cycle_start && (
                  <p className="text-xs text-muted-foreground">
                    Desde {new Date(creditCard.cycle_start).toLocaleDateString("es-HN", { day: "numeric", month: "short" })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtro de periodo */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={String(m)}>{MONTH_NAMES[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(selectedYear)}
          onValueChange={(v) => {
            const y = Number(v);
            setSelectedYear(y);
            const months = monthsForYear(y);
            if (months.length && !months.includes(selectedMonth)) {
              setSelectedMonth(months[0]);
            }
          }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Totales del periodo */}
      {!loadingTxns && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="pt-1 pb-1">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-medium text-muted-foreground">Compras ({currency})</p>
                <TrendingUp className="size-3 text-destructive" />
              </div>
              <p className="text-base font-bold text-destructive">{format(totals.charges_local)}</p>
            </CardContent>
          </Card>
          <Card className="pt-1 pb-1">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-medium text-muted-foreground">Compras (USD)</p>
                <DollarSign className="size-3 text-destructive" />
              </div>
              <p className="text-base font-bold text-destructive">${totals.charges_usd.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Movimientos */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
          <p className="text-sm font-semibold">
            Movimientos - {MONTH_NAMES[selectedMonth]} {selectedYear}
          </p>
          {isGlobalResult && visibleTxns.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              Resultados de todos los períodos
            </Badge>
          )}
        </div>

        <div className="mb-2.5">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por descripción, categoría o # de venta..."
          />
        </div>

        <Card className="pt-1 pb-1">
          <CardContent className="p-0">
            {loadingTxns || isSearching ? (
              <div className="divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3.5">
                    <Skeleton className="size-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : visibleTxns.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-1">
                <CreditCard className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? `Sin resultados para "${search.trim()}" en ningún período`
                    : "Sin movimientos en este periodo"}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {visibleTxns.map((txn) => (
                  <CreditCardTxnRow
                    key={txn.id}
                    txn={txn}
                    format={format}
                    currency={currency}
                    onEdit={() => setEditingTxn(txn)}
                    onDelete={() => setDeletingTxn(txn)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Fab
        actions={[
          {
            label: "Nueva transacción",
            icon: ArrowLeftRight,
            onClick: () => setTransactionOpen(true),
          },
          ...((Number(creditCard?.balance ?? 0) > 0 || Number(creditCard?.balance_usd ?? 0) > 0) ? [{
            label: "Pagar tarjeta",
            icon: Banknote,
            onClick: () => setPayOpen(true),
          }] : []),
        ]}
      />

      <PayCreditCardDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        card={creditCard ?? null}
        accounts={accounts}
        onSuccess={handlePaySuccess}
      />

      <CreateTransactionModal
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        accounts={accounts}
        creditCards={creditCards}
        onSuccess={() => { mutateCard(); mutateTxns(); }}
      />

      <EditCCTransactionDialog
        txn={editingTxn}
        open={!!editingTxn}
        onOpenChange={(v) => { if (!v) setEditingTxn(null); }}
        onSuccess={() => { setEditingTxn(null); mutateCard(); mutateTxns(); }}
        nativeCurrency={currency}
        expenseCategories={expenseCategories}
      />

      <AlertDialog open={!!deletingTxn} onOpenChange={(v) => { if (!v) setDeletingTxn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cargo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revertira el saldo de la tarjeta. Esta accion no se puede deshacer.
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

function CreditCardTxnRow({
  txn,
  format,
  currency,
  onEdit,
  onDelete,
}: {
  txn: CreditCardTransaction;
  format: (v: number) => string;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCharge   = txn.type === "CHARGE";
  const isUsd      = txn.currency === "USD";
  const isEditable = txn.type === "CHARGE" && !txn.sale_id;

  return (
    <div className="flex items-start gap-3 p-3.5">
      <div className={`size-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isCharge ? "bg-destructive/10" : "bg-green-100"
      }`}>
        {isCharge
          ? <ShoppingBag className="size-4 text-destructive" />
          : <Banknote className="size-4 text-green-600" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {txn.description || (isCharge ? "Compra" : "Pago de tarjeta")}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {new Date(txn.occurred_at).toLocaleDateString("es-HN", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </p>
          {txn.sale_number && (
            <Link href={`/sales/${txn.sale_id}`} className="text-xs text-primary hover:underline">
              {txn.sale_number}
            </Link>
          )}
          {txn.account_name && (
            <span className="text-xs text-muted-foreground">{"<-"} {txn.account_name}</span>
          )}
          {isUsd && txn.exchange_rate && (
            <span className="text-xs text-muted-foreground">
              @{Number(txn.exchange_rate).toFixed(2)} = {format(Number(txn.amount_local ?? 0))}
            </span>
          )}
        </div>
        {isCharge && txn.category && (
          <div className="mt-1">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
              <Tag className="size-2.5 shrink-0" />
              {txn.category}
            </Badge>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1">
        <div className="text-right">
          <p className={`text-sm font-bold ${isCharge ? "text-destructive" : "text-green-600"}`}>
            {isCharge ? "+" : "-"}
            {isUsd
              ? `$${Number(txn.amount).toFixed(2)}`
              : format(Number(txn.amount))
            }
          </p>
          {isUsd && (
            <Badge variant="outline" className="text-[9px] mt-0.5">USD</Badge>
          )}
        </div>

        {isEditable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 shrink-0">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
