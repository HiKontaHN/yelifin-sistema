"use client";

import useSWR from "swr";
import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Building2, CheckCircle, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryStats } from "@/components/shared/summary-stats";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { getPaymentTarget, ReceivablesPayablesPaymentDialog, type PaymentTarget } from "@/components/finances/receivables-payables-payment-dialog";
import { ReceivablesPayablesOrigin, type AccountOrigin } from "@/components/finances/receivables-payables-origin";
import { useCurrency } from "@/hooks/swr/use-currency";
import { formatCalendarDate } from "@/lib/date-utils";
import { accountStatusFilters, isPendingReceivablePayable, matchesAccountStatus, type AccountStatusFilter } from "@/lib/receivables-payables-status";

type Props = { type: "receivable" | "payable"; ownerId: string };
type OwnerAccount = AccountOrigin & Parameters<typeof getPaymentTarget>[1] & {
  customer_id?: number | null;
  person_id?: number | null;
  entity_id?: number | null;
  customer_name?: string;
  entity_name?: string;
  due_date?: string | null;
  paid_amount?: number | string | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el historial");
  return body;
};

const date = (value: string | null | undefined) => value
  ? formatCalendarDate(value)
  : "Sin vencimiento";

const getPaid = (account: OwnerAccount) => Number(account.paid_amount ?? 0);
const getBalance = (account: OwnerAccount) => Number(account.outstanding_amount ?? 0);

function StatusBadge({ status }: { status: string }) {
  if (status === "PAID") return <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">Pagada</Badge>;
  if (status === "CANCELLED") return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">Cancelada</Badge>;
  if (status === "OVERDUE") return <Badge variant="outline" className="border-red-200 bg-red-100 text-red-700">Vencida</Badge>;
  if (status === "PARTIAL") return <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-700">Parcial</Badge>;
  return <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-700">Pendiente</Badge>;
}

export function ReceivablesPayablesOwnerDetail({ type, ownerId }: Props) {
  const router = useRouter();
  const { format } = useCurrency();
  const [target, setTarget] = useState<PaymentTarget | null>(null);
  const [filter, setFilter] = useState<AccountStatusFilter>("pending");
  const isReceivable = type === "receivable";
  const endpoint = isReceivable ? "/api/accounts-receivable" : "/api/accounts-payable";
  const { data, error, isLoading } = useSWR<{ data: OwnerAccount[] }>(`${endpoint}?include_cancelled=true`, fetcher);
  const accounts = (data?.data ?? []).filter((account) => {
    if (!isReceivable) return ownerId === `entity-${account.entity_id}`;
    if (ownerId.startsWith("customer-")) return ownerId === `customer-${account.customer_id}`;
    return ownerId === `person-${account.person_id}` && !account.customer_id;
  });
  const name = accounts[0] ? (isReceivable ? accounts[0].customer_name : accounts[0].entity_name) : "Detalle";
  const paid = accounts.reduce((sum, account) => sum + getPaid(account), 0);
  const pendingAccounts = accounts.filter((account) => isPendingReceivablePayable(account.status));
  const balance = pendingAccounts.reduce((sum, account) => sum + getBalance(account), 0);
  const total = paid + accounts.reduce((sum, account) => sum + getBalance(account), 0);
  const visibleAccounts = accounts.filter((account) => matchesAccountStatus(account.status, filter));
  const backPath = `/finances/receivables-payables/${isReceivable ? "cobrar" : "pagar"}`;
  const detailPath = (account: OwnerAccount) => `${backPath}/${account.id}`;
  const paidLabel = isReceivable ? "Cobrado" : "Pagado";

  if (isLoading) return <div className="space-y-4"><div className="h-9 w-56 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div>;

  if (error || accounts.length === 0) return <div className="space-y-4"><Button variant="ghost" onClick={() => router.push(backPath)}><ArrowLeft className="size-4" />Volver</Button><p className="text-sm text-destructive">{error?.message ?? `${isReceivable ? "Persona" : "Entidad"} sin historial de cuentas`}</p></div>;

  const renderPaymentButton = (account: OwnerAccount) => {
    const paymentTarget = getPaymentTarget(type, account);
    if (!paymentTarget) return null;

    const openPayment = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setTarget(paymentTarget);
    };

    return (
      <Button type="button" size="sm" variant="outline" className="relative z-10" onClick={openPayment}>
        Registrar {isReceivable ? "cobro" : "pago"}
      </Button>
    );
  };

  const renderBalance = (account: OwnerAccount) => (
    <>
      <p className={account.status === "CANCELLED" ? "font-semibold text-muted-foreground" : "font-semibold text-amber-700 dark:text-amber-400"}>{format(getBalance(account))}</p>
      {account.status === "CANCELLED" && <p className="text-xs text-muted-foreground">al cancelar</p>}
      <p className="text-xs text-muted-foreground">de {format(getPaid(account) + getBalance(account))}</p>
    </>
  );

  const columns: DataTableTimeSectionColumn<OwnerAccount>[] = [
    { id: "description", header: "Descripción", cell: (account) => (
      <div className="space-y-1">
        <Link href={detailPath(account)} onClick={(event) => event.stopPropagation()} className="block wrap-break-word font-medium hover:underline">
          {account.description || "Ver cuenta"}
        </Link>
        <ReceivablesPayablesOrigin account={account} />
      </div>
    ) },
    { id: "status", header: "Estado", width: 112, cell: (account) => <StatusBadge status={account.status} /> },
    { id: "due", header: "Vencimiento", width: 142, cell: (account) => date(account.due_date) },
    { id: "paid", header: paidLabel, width: 110, align: "right", cell: (account) => format(getPaid(account)) },
    { id: "balance", header: "Saldo", width: 128, align: "right", cell: renderBalance },
    { id: "actions", header: <span className="sr-only">Acciones</span>, width: 150, align: "right", stopRowClick: true, cell: renderPaymentButton },
  ];

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(backPath)} aria-label="Volver"><ArrowLeft className="size-5" /></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-semibold">{name}</h1><p className="text-sm text-muted-foreground">Historial consolidado de cuentas {isReceivable ? "por cobrar" : "por pagar"}.</p></div>
      </div>

      <SummaryStats ariaLabel={`Resumen de ${name}`} items={[
        { label: "Total histórico", icon: isReceivable ? ArrowDownToLine : ArrowUpFromLine, value: format(total), detail: `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"}` },
        { label: paidLabel, icon: CheckCircle, value: format(paid), valueClassName: "text-green-600 dark:text-green-400", detail: "pagos registrados" },
        { label: "Saldo pendiente", icon: Clock, value: format(balance), valueClassName: "text-amber-600 dark:text-amber-400", detail: `${pendingAccounts.length} pendiente${pendingAccounts.length === 1 ? "" : "s"}` },
        { label: isReceivable ? "Persona" : "Entidad", icon: isReceivable ? Users : Building2, value: name, detail: "responsable de las cuentas" },
      ]} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Historial de cuentas</h2>
        <div role="group" aria-label="Filtrar por estado de cuenta" className="flex flex-wrap gap-2">
          {accountStatusFilters.map(({ value, label }) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      <DataTableTimeSection
        columns={columns}
        data={visibleAccounts}
        getRowKey={(account) => account.id}
        onRowClick={(account) => router.push(detailPath(account))}
        ariaLabel="Historial de cuentas"
        emptyState={accountStatusFilters.find(({ value }) => value === filter)?.empty}
        minWidth={830}
        showFooterPagination={false}
        renderMobileRow={(account) => (
          <Card className="relative isolate gap-0 transition-colors hover:bg-muted/50">
            <CardContent className="space-y-2 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={detailPath(account)} className="min-w-0 wrap-break-word font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                      {account.description || "Ver cuenta"}
                    </Link>
                    <StatusBadge status={account.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{date(account.due_date)} · {paidLabel} {format(getPaid(account))}</p>
                  <ReceivablesPayablesOrigin account={account} />
                </div>
                <div className="shrink-0 text-right">{renderBalance(account)}</div>
              </div>
              <div className="flex justify-end empty:hidden">{renderPaymentButton(account)}</div>
            </CardContent>
          </Card>
        )}
      />
      {target && <ReceivablesPayablesPaymentDialog target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
