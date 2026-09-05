// app/(dashboard)/finances/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Wallet, Banknote, CreditCard, TrendingUp, TrendingDown,
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, ExternalLink,
  Pencil, Trash2, Building2, MoreVertical, ChevronRight,
} from "lucide-react";
import { useFinances, useFinancePeriods } from "@/hooks/swr/use-finances";
import { useAccounts, Account } from "@/hooks/swr/use-accounts";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useCreditCards } from "@/hooks/swr/use-credit-cards";
import { CreateTransactionModal } from "@/components/transactions/create-transaction-modal";
import { CreateAccountDialog } from "@/components/accounts/create-account-dialog";
import { EditAccountDialog } from "@/components/accounts/edit-account-dialog";
import { DeleteAccountDialog } from "@/components/accounts/delete-account-dialog";
import { CreateCreditCardDialog } from "@/components/credit-cards/create-credit-card-dialog";
import { Fab } from "@/components/ui/fab";
import { useModulePermissions } from "@/hooks/use-module-permissions";

const MONTH_NAMES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ACCOUNT_ICONS: Record<string, React.ElementType> = {
  CASH: Banknote, BANK: Building2, WALLET: CreditCard, OTHER: Wallet,
};

const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  CASH: { label: "Efectivo", color: "bg-green-100 text-green-700 border-green-200" },
  BANK: { label: "Banco", color: "bg-blue-100 text-blue-700 border-blue-200" },
  WALLET: { label: "Billetera digital", color: "bg-purple-100 text-purple-700 border-purple-200" },
  OTHER: { label: "Otro", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

const TYPE_CONFIG = {
  INCOME: { icon: ArrowDownCircle, color: "text-green-600", sign: "+" },
  EXPENSE: { icon: ArrowUpCircle, color: "text-destructive", sign: "-" },
  TRANSFER: { icon: ArrowLeftRight, color: "text-blue-600", sign: "" },
};

const REF_LABELS: Record<string, string> = {
  SALE: "Venta",
  PURCHASE: "Compra inventario",
  SUPPLY_PURCHASE: "Compra suministros",
  OTHER: "Manual",
};

export default function FinancesPage() {
  const now = new Date();
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Restaurados desde la URL — "volver" desde /finances/credit-cards/[id]
  // (que usa router.back()) trae de vuelta esta misma URL con el
  // mes/año que se estaban viendo.
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(() => {
    const v = Number(searchParams.get("month"));
    return v >= 1 && v <= 12 ? v : now.getMonth() + 1;
  });
  const [selectedYear, setSelectedYear] = useState<number | undefined>(() => {
    const v = Number(searchParams.get("year"));
    return v > 0 ? v : now.getFullYear();
  });
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createCardOpen, setCreateCardOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedMonth !== undefined && selectedMonth !== now.getMonth() + 1) params.set("month", String(selectedMonth));
    if (selectedYear !== undefined && selectedYear !== now.getFullYear()) params.set("year", String(selectedYear));
    const qs = params.toString();
    replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [selectedMonth, selectedYear, pathname, replace]);

  const { summary, isLoading, mutate: mutateSummary } = useFinances({ month: selectedMonth, year: selectedYear });
  const { periods } = useFinancePeriods();
  const { accounts, mutate: mutateAccounts } = useAccounts();
  const { format } = useCurrency();
  const { creditCards, mutate: mutateCreditCards } = useCreditCards();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("FINANCES");

  const availableYears = [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a);
  const monthsForYear = (y: number) => {
    const periodsMonths = periods.filter((p) => p.year === y).map((p) => p.month);

    if (y === now.getFullYear()) {
      const currentMonth = now.getMonth() + 1;
      if (!periodsMonths.includes(currentMonth)) {
        periodsMonths.push(currentMonth);
      }
    }
    return periodsMonths.sort((a, b) => b - a);
  };

  const totalBalance = (summary?.accounts ?? []).reduce((acc, a) => acc + Number(a.balance), 0);

  const periodLabel = selectedYear && selectedMonth
    ? `${MONTH_NAMES[selectedMonth]} ${selectedYear}`
    : selectedYear
      ? `Año ${selectedYear}`
      : `${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;

  const cashFlow = (summary?.cash_flow ?? []).map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short" }),
    income: Number(d.income),
    expense: Number(d.expense),
  }));

  // Solo para operaciones de cuentas (crear/editar/eliminar)
  const onAccountSuccess = () => { mutateAccounts(); mutateSummary(); };

  return (
    <div className="space-y-4 pb-24">

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-muted-foreground text-sm">{periodLabel}</p>
      </div>

      {/* ── Grid 2×2: [stats | gráfico] / [cuentas | transacciones] ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 1. Stats — filtros + balance + ingresos/egresos */}
        <Card className="pt-1 pb-1">
          <CardContent className="p-4 flex flex-col gap-4">
            {/* Filtros */}
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={selectedMonth ? String(selectedMonth) : "all"}
                onValueChange={(v) => setSelectedMonth(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el año</SelectItem>
                  {(selectedYear ? monthsForYear(selectedYear) : monthsForYear(now.getFullYear())).map((m) => (
                    <SelectItem key={m} value={String(m)}>{MONTH_NAMES[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedYear ? String(selectedYear) : String(now.getFullYear())}
                onValueChange={(v) => {
                  const y = Number(v);
                  setSelectedYear(y);
                  const months = periods.filter((p) => p.year === y).map((p) => p.month);
                  if (selectedMonth && !months.includes(selectedMonth)) setSelectedMonth(undefined);
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.length === 0 && (
                    <SelectItem value={String(now.getFullYear())}>{now.getFullYear()}</SelectItem>
                  )}
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Balance total */}
            <div className="rounded-xl bg-primary text-primary-foreground p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium opacity-80">Balance total</span>
                <Wallet className="size-4 opacity-60" />
              </div>
              {isLoading
                ? <Skeleton className="h-8 w-32 bg-primary-foreground/20" />
                : <div className="text-3xl font-bold">{format(totalBalance)}</div>
              }
              <p className="text-xs opacity-60 mt-1">
                {summary?.accounts.length ?? 0} cuenta{(summary?.accounts.length ?? 0) !== 1 ? "s" : ""} activa{(summary?.accounts.length ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Ingresos / Egresos */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Ingresos</span>
                  <TrendingUp className="size-3 text-green-600" />
                </div>
                <div className="text-base font-bold text-green-600">
                  {isLoading ? <Skeleton className="h-5 w-20" /> : format(summary?.period.income ?? 0)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{periodLabel}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Egresos</span>
                  <TrendingDown className="size-3 text-destructive" />
                </div>
                <div className="text-base font-bold text-destructive">
                  {isLoading ? <Skeleton className="h-5 w-20" /> : format(summary?.period.expense ?? 0)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{periodLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Gráfico de flujo de efectivo */}
        <Card className="pt-1 pb-1">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Flujo de efectivo</p>
              <span className="text-xs text-muted-foreground">{periodLabel}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : cashFlow.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este período</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cashFlow}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `L${Math.round(v / 1000)}k` : `L${v}`}
                  />
                  <Tooltip
                    formatter={(v: number) => format(v)}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="income" stroke="#10B981" fill="#10B981" fillOpacity={0.15} strokeWidth={2} name="Ingresos" />
                  <Area type="monotone" dataKey="expense" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} strokeWidth={2} name="Egresos" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 3. Cuentas y tarjetas */}
        <Card className="pt-1 pb-1">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b">
              <p className="text-sm font-semibold">Cuentas y tarjetas</p>
            </div>
            {isLoading ? (
              <div className="divide-y">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3.5">
                    <Skeleton className="size-8 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : (summary?.accounts ?? []).length === 0 && creditCards.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <Wallet className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground mt-2">Sin cuentas creadas</p>
              </div>
            ) : (
              <div className="divide-y">
                {(summary?.accounts ?? []).map((account) => {
                  const Icon = ACCOUNT_ICONS[account.type] ?? Wallet;
                  const typeConfig = ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.OTHER;
                  const fullAccount = accounts.find((a) => a.id === account.id);
                  return (
                    <div key={account.id} className="flex items-center gap-3 p-3.5">
                      <div
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors -m-1 p-1"
                        onClick={() => push(`/finances/transactions?account_id=${account.id}`)}
                      >
                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="size-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{account.name}</p>
                          <Badge className={`text-[10px] mt-0.5 ${typeConfig.color}`} variant="outline">
                            {typeConfig.label}
                          </Badge>
                        </div>
                        <p className="text-sm font-bold shrink-0">{format(Number(account.balance))}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost" size="icon" className="size-7 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); fullAccount && setEditAccount(fullAccount); }}>
                              <Pencil className="size-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); fullAccount && setDeleteAccount(fullAccount); }}
                              >
                                <Trash2 className="size-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
                {creditCards.map((card) => (
                  <div key={`cc-${card.id}`} className="flex items-center gap-3 p-3.5">
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors -m-1 p-1"
                      onClick={() => push(`/finances/transactions?account_id=cc-${card.id}`)}
                    >
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <CreditCard className="size-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium truncate">{card.name}</p>
                          {card.last_four && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              ···· {card.last_four}
                            </Badge>
                          )}
                        </div>
                        {card.balance > 0 ? (
                          <p className="text-xs text-destructive font-medium mt-0.5">{format(Number(card.balance))}</p>
                        ) : card.balance_usd > 0 ? (
                          <p className="text-xs text-destructive font-medium mt-0.5">${Number(card.balance_usd).toFixed(2)} USD</p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">Sin deuda</p>
                        )}
                      </div>
                    </div>
                    <Link href={`/finances/credit-cards/${card.id}`} onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0">
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Movimientos de hoy */}
        <Card className="pt-1 pb-1">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b">
              <div>
                <p className="text-sm font-semibold">Movimientos de hoy</p>
                <p className="text-xs text-muted-foreground">
                  {summary?.today.count ?? 0} transaccione{(summary?.today.count ?? 0) !== 1 ? "s" : ""} ·{" "}
                  <span className="text-green-600">+{format(summary?.today.income ?? 0)}</span>
                  {" "}
                  <span className="text-destructive">-{format(summary?.today.expense ?? 0)}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
                <Link href="/finances/transactions">
                  Ver todas <ExternalLink className="size-3" />
                </Link>
              </Button>
            </div>
            <div className="divide-y">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3.5">
                    <Skeleton className="size-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16 shrink-0" />
                  </div>
                ))
              ) : !summary?.today_transactions.length ? (
                <div className="py-8 flex flex-col items-center justify-center">
                  <ArrowLeftRight className="size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mt-2">Sin movimientos hoy</p>
                </div>
              ) : (
                summary.today_transactions.map((t) => {
                  const cfg = TYPE_CONFIG[t.type];
                  const Icon = cfg.icon;
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3.5">
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Icon className={`size-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {t.description || REF_LABELS[t.reference_type ?? "OTHER"] || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.account_name}
                          {t.to_account_name && <span> → {t.to_account_name}</span>}
                        </p>
                      </div>
                      <p className={`text-sm font-bold shrink-0 ${cfg.color}`}>
                        {cfg.sign}{format(Number(t.amount))}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

      </div>

      <Fab
        actions={[
          ...(canEdit ? [{ label: "Nueva cuenta", icon: Wallet, onClick: () => setCreateAccountOpen(true) }] : []),
          ...(canEdit ? [{ label: "Nueva tarjeta de crédito", icon: CreditCard, onClick: () => setCreateCardOpen(true) }] : []),
          ...(canEdit ? [{ label: "Nueva transacción", icon: ArrowLeftRight, onClick: () => setTransactionOpen(true) }] : []),
        ]}
      />

      {/* CreateTransactionModal mutea internamente: transactions + accounts + finances */}
      <CreateTransactionModal
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        accounts={accounts}
        creditCards={creditCards}
      />
      <CreateAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        onSuccess={onAccountSuccess}
      />
      <CreateCreditCardDialog
        open={createCardOpen}
        onOpenChange={setCreateCardOpen}
        onSuccess={() => mutateCreditCards()}
      />
      <EditAccountDialog
        account={editAccount}
        open={!!editAccount}
        onOpenChange={(open) => !open && setEditAccount(null)}
        onSuccess={onAccountSuccess}
      />
      <DeleteAccountDialog
        account={deleteAccount}
        open={!!deleteAccount}
        onOpenChange={(open) => !open && setDeleteAccount(null)}
        onSuccess={onAccountSuccess}
      />
    </div>
  );
}